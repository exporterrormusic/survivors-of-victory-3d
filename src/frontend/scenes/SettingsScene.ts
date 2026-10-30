import Phaser from "phaser";

import { bleed, logicalPointerPosition, pinToEdge, view } from "../rendering/DisplayQualityPlugin";

import { gameAudio, preloadLobbyAudio } from "../audio/GameAudio";
import { captureDevelopmentPreview } from "../dev/capturePreview";
import {
  type AudioSettings,
  type ControlAction,
  type ControlBinding,
  type ControlSettings,
  type DisplaySettings,
  type GameplaySettings,
  CONTROL_BINDING_DEFINITIONS,
  SUPPORTED_RESOLUTIONS,
  controlBindingsEqual,
  formatControlBinding,
  loadAudioSettings,
  loadControlSettings,
  loadDisplaySettings,
  loadGameplaySettings,
  saveAudioSettings,
  resetControlSettings,
  saveControlSettings,
  saveDisplaySettings,
  saveGameplaySettings,
  scaledSfxVolume,
} from "../settings/GameSettings";
import {
  eraseAllSaveData,
  exportSaveData,
  importSaveData,
  saveStorageAvailable,
} from "../persistence/ProfileStorage";
import { GAME_VERSION } from "../../version";
import {
  nextNikkeTransitionProfile,
  NIKKE_TRANSITION_PROFILES,
  playHexWipeCover,
  playHexWipeReveal,
  type HexWipeProfile,
} from "../ui/transitions/HexWipeTransition";

const WIDTH = 1920;
const HEIGHT = 1080;

const AUDIO = {
  confirm: "settings-confirm",
  select: "settings-select",
} as const;

type SettingsCategory = "audio" | "controls" | "data" | "gameplay" | "video";

interface CategoryDefinition {
  readonly description: string;
  readonly id: SettingsCategory;
  readonly index: string;
  readonly title: string;
}

interface SettingsSceneData {
  readonly previousScene?: string;
  readonly revealTransition?: boolean;
  readonly transitionProfile?: HexWipeProfile;
}

const CATEGORIES: readonly CategoryDefinition[] = [
  { description: "VOLUME MIX", id: "audio", index: "01", title: "AUDIO" },
  { description: "DISPLAY OUTPUT", id: "video", index: "02", title: "VIDEO" },
  {
    description: "READABILITY & FEEDBACK",
    id: "gameplay",
    index: "03",
    title: "GAMEPLAY",
  },
  {
    description: "KEY BINDINGS",
    id: "controls",
    index: "04",
    title: "CONTROLS",
  },
  { description: "SAVE BACKUP & RESET", id: "data", index: "05", title: "DATA" },
];

export class SettingsScene extends Phaser.Scene {
  private audioSettings: AudioSettings = loadAudioSettings();
  private categoryLayer?: Phaser.GameObjects.Container;
  private controlSettings: ControlSettings = loadControlSettings();
  private contentLayer?: Phaser.GameObjects.Container;
  private capturingControl?: ControlAction;
  private suppressBindingPointerUp = false;
  private currentCategory: SettingsCategory = "audio";
  /** Erasing everything takes a second press within a few seconds. */
  private eraseArmedUntil = 0;
  private dataMessage = "";
  private displaySettings: DisplaySettings = loadDisplaySettings();
  private gameplaySettings: GameplaySettings = loadGameplaySettings();
  private musicVolume = 0.8;
  private previousScene?: string;
  private revealTransition = false;
  private transitionProfile?: HexWipeProfile;
  private sfxVolume = 0.8;

  public constructor() {
    super("settings");
  }

  public preload(): void {
    this.load.audio(AUDIO.select, "assets/audio/ui/select.wav");
    this.load.audio(AUDIO.confirm, "assets/audio/ui/confirm.wav");
    preloadLobbyAudio(this);
  }

  public init(data: SettingsSceneData = {}): void {
    this.previousScene = data.previousScene;
    this.revealTransition = data.revealTransition ?? false;
    this.transitionProfile = data.transitionProfile;
  }

  public create(): void {
    this.audioSettings = loadAudioSettings();
    this.controlSettings = loadControlSettings();
    this.displaySettings = loadDisplaySettings();
    this.gameplaySettings = loadGameplaySettings();
    const requestedCategory = new URLSearchParams(window.location.search).get(
      "settings",
    );
    if (CATEGORIES.some((category) => category.id === requestedCategory)) {
      this.currentCategory = requestedCategory as SettingsCategory;
    }
    this.musicVolume = this.audioSettings.musicVolume;
    this.sfxVolume = this.audioSettings.sfxVolume;
    this.createBackdrop();
    this.createHeader();
    this.createBackButton();
    this.renderCategoryRail();
    this.renderContent();
    gameAudio.stopEnvironmentAmbience();
    gameAudio.playLobby(this);

    this.input.keyboard?.on("keydown", (event: KeyboardEvent) =>
      this.handleSettingsKeyDown(event),
    );
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) =>
      this.handleSettingsPointerDown(pointer),
    );
    this.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _currentlyOver: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
      ) => this.handleSettingsWheel(deltaY),
    );
    if (this.revealTransition) {
      playHexWipeReveal(this, this.transitionProfile ?? "SYSTEM CONFIG");
      if (this.previousScene !== undefined) {
        this.scene.stop(this.previousScene);
      }
    } else {
      this.cameras.main.fadeIn(260, 8, 13, 18);
    }
    if (
      import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get("transition") ===
        "profile"
    ) {
      playHexWipeReveal(this, NIKKE_TRANSITION_PROFILES[0]!);
      captureDevelopmentPreview(this, "transition-profile");
    } else {
      captureDevelopmentPreview(this, "settings-hybrid");
    }
  }

  private createBackdrop(): void {
    this.add.rectangle(bleed.left, 0, bleed.width, HEIGHT, 0xe9edf1).setOrigin(0);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x81909c, 0.09);
    for (let x = bleed.left - 420; x < bleed.right + 420; x += 205) {
      grid.lineBetween(x, 76, x + 430, HEIGHT - 48);
    }
    grid.lineStyle(1, 0x81909c, 0.06);
    for (let y = 170; y < HEIGHT - 80; y += 115) {
      grid.lineBetween(bleed.left, y, bleed.right, y);
    }

    const chrome = this.add.graphics();
    chrome.fillStyle(0x090d12, 0.97);
    chrome.fillRect(bleed.left, 0, bleed.width, 76);
    chrome.fillRect(bleed.left, HEIGHT - 48, bleed.width, 48);
    chrome.fillStyle(0x35c5f2, 1);
    chrome.fillRect(bleed.left, 74, 515 - bleed.left, 3);
    chrome.fillStyle(0xaeb7c1, 0.28);
    chrome.fillRect(515, 75, bleed.right - 515, 1);

    pinToEdge(this.add.text(view.left + 52, 25, "ARK SYSTEM / CONFIGURATION", {
      color: "#f2f5f7",
      fontFamily: "Rajdhani",
      fontSize: "26px",
      fontStyle: "bold",
      letterSpacing: 1.8,
    }), "left");
    pinToEdge(this.add.text(view.right - 146, 26, "02", {
      color: "#9aa4af",
      fontFamily: "Rajdhani",
      fontSize: "25px",
      fontStyle: "bold",
    }), "right");
    pinToEdge(this.add.text(view.left + 52, 1038, `SYS CONFIG // ARK SYS V${GAME_VERSION}`, {
      color: "#8a949f",
      fontFamily: "Rajdhani",
      fontSize: "15px",
      fontStyle: "bold",
      letterSpacing: 2,
    }), "left");
    pinToEdge(this.add.text(view.right - 313, 1038, "CHANGES APPLY AUTOMATICALLY", {
      color: "#35c5f2",
      fontFamily: "Rajdhani",
      fontSize: "15px",
      fontStyle: "bold",
      letterSpacing: 1.4,
    }), "right");
  }

  private createHeader(): void {
    this.add.text(70, 116, "SETTINGS", {
      color: "#20262d",
      fontFamily: "Rajdhani",
      fontSize: "60px",
      fontStyle: "bold",
      letterSpacing: 2,
    });
    this.add.text(73, 185, "SYSTEM CONFIG // COMMANDER PREFERENCES", {
      color: "#707b86",
      fontFamily: "Rajdhani",
      fontSize: "17px",
      fontStyle: "bold",
      letterSpacing: 2.6,
    });
    const marker = this.add.graphics();
    marker.fillStyle(0x35c5f2, 1);
    marker.fillRect(73, 220, 82, 4);
    marker.fillStyle(0x76828d, 0.28);
    marker.fillRect(155, 221, 335, 1);
  }

  private createBackButton(): void {
    const x = 1640;
    const y = 112;
    const width = 208;
    const height = 58;
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    const hitArea = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(111, height / 2, "BACK", {
        color: "#26303a",
        fontFamily: "Rajdhani",
        fontSize: "23px",
        fontStyle: "bold",
        letterSpacing: 1.2,
      })
      .setOrigin(0.5);

    const draw = (hovered: boolean): void => {
      surface.clear();
      surface.fillStyle(hovered ? 0xffffff : 0xf7f9fa, 1);
      surface.fillPoints(
        [
          new Phaser.Math.Vector2(8, 0),
          new Phaser.Math.Vector2(width, 0),
          new Phaser.Math.Vector2(width - 8, height),
          new Phaser.Math.Vector2(0, height),
        ],
        true,
      );
      surface.lineStyle(1, hovered ? 0x35c5f2 : 0xb9c2ca, 1);
      surface.strokePoints(
        [
          new Phaser.Math.Vector2(8, 0),
          new Phaser.Math.Vector2(width, 0),
          new Phaser.Math.Vector2(width - 8, height),
          new Phaser.Math.Vector2(0, height),
        ],
        true,
        true,
      );
      surface.lineStyle(3, hovered ? 0x1f8fe0 : 0x35414b, 1);
      surface.lineBetween(37, 29, 58, 29);
      surface.lineBetween(37, 29, 47, 19);
      surface.lineBetween(37, 29, 47, 39);
    };
    draw(false);
    hitArea.on("pointerover", () => {
      draw(true);
      this.sound.play(AUDIO.select, {
        volume: scaledSfxVolume(0.14, this.audioSettings),
      });
    });
    hitArea.on("pointerout", () => draw(false));
    hitArea.on("pointerup", () => this.leave());
    container.add([surface, label, hitArea]);
  }

  private renderCategoryRail(): void {
    this.categoryLayer?.destroy(true);
    const layer = this.add.container(0, 0);
    this.categoryLayer = layer;
    CATEGORIES.forEach((category, row) => {
      layer.add(this.createCategoryButton(category, 70, 280 + row * 122));
    });

    const readout = this.add.graphics();
    readout.fillStyle(0x202a33, 0.11);
    readout.fillRect(70, 904, 354, 1);
    layer.add(readout);
    layer.add(
      this.add.text(70, 922, "CONFIG REGISTER", {
        color: "#8a949e",
        fontFamily: "Rajdhani",
        fontSize: "13px",
        fontStyle: "bold",
        letterSpacing: 2.4,
      }),
    );
    layer.add(
      this.add.text(70, 945, "LOCAL PROFILE // SLOT 01", {
        color: "#313b45",
        fontFamily: "Rajdhani",
        fontSize: "17px",
        fontStyle: "bold",
        letterSpacing: 1.2,
      }),
    );
  }

  private createCategoryButton(
    category: CategoryDefinition,
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const selected = category.id === this.currentCategory;
    const width = 354;
    const height = 116;
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    const hitArea = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });

    const draw = (hovered: boolean): void => {
      surface.clear();
      surface.fillStyle(selected ? 0x141c24 : hovered ? 0xffffff : 0xf8fafb, 1);
      surface.fillPoints(
        [
          new Phaser.Math.Vector2(12, 0),
          new Phaser.Math.Vector2(width, 0),
          new Phaser.Math.Vector2(width - 12, height),
          new Phaser.Math.Vector2(0, height),
        ],
        true,
      );
      surface.lineStyle(
        selected ? 2 : 1,
        selected ? 0xffd23f : hovered ? 0x35c5f2 : 0xc9d0d6,
        1,
      );
      surface.strokePoints(
        [
          new Phaser.Math.Vector2(12, 0),
          new Phaser.Math.Vector2(width, 0),
          new Phaser.Math.Vector2(width - 12, height),
          new Phaser.Math.Vector2(0, height),
        ],
        true,
        true,
      );
      surface.fillStyle(selected ? 0xffd23f : 0x35c5f2, 1);
      surface.fillPoints(
        [
          new Phaser.Math.Vector2(12, 0),
          new Phaser.Math.Vector2(18, 0),
          new Phaser.Math.Vector2(6, height),
          new Phaser.Math.Vector2(0, height),
        ],
        true,
      );
    };
    draw(false);

    const index = this.add.text(30, 22, category.index, {
      color: selected ? "#ffd23f" : "#9aa5af",
      fontFamily: "Rajdhani",
      fontSize: "16px",
      fontStyle: "bold",
      letterSpacing: 1.2,
    });
    const title = this.add.text(74, 21, category.title, {
      color: selected ? "#f3f6f8" : "#27313a",
      fontFamily: "Rajdhani",
      fontSize: "31px",
      fontStyle: "bold",
      letterSpacing: 1.2,
    });
    const description = this.add.text(76, 69, category.description, {
      color: selected ? "#9dabb6" : "#7f8993",
      fontFamily: "Rajdhani",
      fontSize: "14px",
      fontStyle: "bold",
      letterSpacing: 1.5,
    });

    hitArea.on("pointerover", () => {
      draw(true);
      if (!selected) {
        this.sound.play(AUDIO.select, {
          volume: scaledSfxVolume(0.13, this.audioSettings),
        });
      }
    });
    hitArea.on("pointerout", () => draw(false));
    hitArea.on("pointerup", () => {
      if (category.id === this.currentCategory) {
        return;
      }
      this.currentCategory = category.id;
      this.sound.play(AUDIO.confirm, {
        volume: scaledSfxVolume(0.18, this.audioSettings),
      });
      this.renderCategoryRail();
      this.renderContent();
    });
    container.add([surface, index, title, description, hitArea]);
    return container;
  }

  private renderContent(): void {
    this.contentLayer?.destroy(true);
    const layer = this.add.container(0, 0);
    this.contentLayer = layer;
    const x = 486;
    const y = 280;
    const width = 1362;
    const height = 650;

    const panel = this.add.graphics();
    panel.fillStyle(0xffffff, 0.97);
    panel.fillRect(x, y, width, height);
    panel.lineStyle(1, 0xc8d0d7, 1);
    panel.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    panel.fillStyle(0x15202a, 1);
    panel.fillRect(x, y, width, 7);
    panel.fillStyle(0x35c5f2, 1);
    panel.fillRect(x, y, 190, 7);
    layer.add(panel);

    const selected = CATEGORIES.find(
      (category) => category.id === this.currentCategory,
    )!;
    layer.add(
      this.add.text(x + 48, y + 40, selected.title, {
        color: "#252f38",
        fontFamily: "Rajdhani",
        fontSize: "40px",
        fontStyle: "bold",
        letterSpacing: 1.6,
      }),
    );
    layer.add(
      this.add.text(x + 51, y + 91, selected.description, {
        color: "#7a858f",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 2.2,
      }),
    );
    layer.add(
      this.add
        .text(x + width - 58, y + 43, `CFG / ${selected.index}`, {
          color: "#a0a9b1",
          fontFamily: "Rajdhani",
          fontSize: "16px",
          fontStyle: "bold",
          letterSpacing: 1.5,
        })
        .setOrigin(1, 0),
    );

    const divider = this.add.graphics();
    divider.fillStyle(0x27333e, 0.14);
    divider.fillRect(x + 48, y + 132, width - 96, 1);
    layer.add(divider);

    switch (this.currentCategory) {
      case "audio":
        this.renderAudioPane(layer, x, y);
        break;
      case "video":
        this.renderVideoPane(layer, x, y);
        break;
      case "gameplay":
        this.renderGameplayPane(layer, x, y);
        break;
      case "controls":
        this.renderControlsPane(layer, x, y);
        break;
      case "data":
        this.renderDataPane(layer, x, y);
        break;
    }
  }

  private renderAudioPane(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
  ): void {
    this.createVolumeRow(
      layer,
      x + 52,
      y + 190,
      "MUSIC",
      this.musicVolume,
      (value) => {
        this.musicVolume = value;
        this.audioSettings.musicVolume = value;
        saveAudioSettings(this.audioSettings);
        this.setMenuMusicVolume(value);
      },
    );
    this.createVolumeRow(
      layer,
      x + 52,
      y + 340,
      "SFX",
      this.sfxVolume,
      (value) => {
        this.sfxVolume = value;
        this.audioSettings.sfxVolume = value;
        saveAudioSettings(this.audioSettings);
        gameAudio.updateAmbienceVolume();
      },
    );
    layer.add(
      this.add.text(x + 52, y + 532, "OUTPUT", {
        color: "#8a949e",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "bold",
        letterSpacing: 2,
      }),
    );
    layer.add(
      this.add.text(x + 256, y + 526, "DEFAULT SYSTEM DEVICE", {
        color: "#313b44",
        fontFamily: "Rajdhani",
        fontSize: "19px",
        fontStyle: "bold",
        letterSpacing: 1,
      }),
    );
  }

  private createVolumeRow(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    initialValue: number,
    onChanged: (value: number) => void,
  ): void {
    const trackX = x + 206;
    const trackWidth = 820;
    const valueText = this.add
      .text(x + 1195, y + 2, `${Math.round(initialValue * 100)}%`, {
        color: "#1f8fe0",
        fontFamily: "Rajdhani",
        fontSize: "39px",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);
    layer.add(
      this.add
        .text(x, y, label, {
          color: "#29333c",
          fontFamily: "Rajdhani",
          fontSize: "23px",
          fontStyle: "bold",
          letterSpacing: 1.4,
        })
        .setOrigin(0, 0.5),
    );

    const slider = this.add.graphics();
    const redraw = (value: number): void => {
      slider.clear();
      slider.fillStyle(0xd6dce1, 1);
      slider.fillRect(trackX, y - 4, trackWidth, 8);
      slider.fillStyle(0x35c5f2, 1);
      slider.fillRect(trackX, y - 4, trackWidth * value, 8);
      slider.fillStyle(0x202b34, 1);
      slider.fillRect(trackX + trackWidth * value - 7, y - 18, 14, 36);
    };
    redraw(initialValue);
    layer.add(slider);

    const hit = this.add
      .rectangle(trackX, y, trackWidth, 58, 0xffffff, 0)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true, draggable: true });
    const applyPointer = (pointer: Phaser.Input.Pointer): void => {
      const value = Phaser.Math.Clamp(
        (logicalPointerPosition(pointer).x - trackX) / trackWidth,
        0,
        1,
      );
      redraw(value);
      valueText.setText(`${Math.round(value * 100)}%`);
      onChanged(value);
    };
    hit.on("pointerdown", applyPointer);
    hit.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        applyPointer(pointer);
      }
    });
    hit.on("pointerup", () => {
      if (label === "SFX") {
        this.sound.play(AUDIO.select, {
          volume: scaledSfxVolume(0.22, this.audioSettings),
        });
      }
    });
    layer.add([valueText, hit]);
  }

  private renderVideoPane(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
  ): void {
    const resolution = this.displaySettings.resolution;
    this.createChoiceRow(
      layer,
      x + 52,
      y + 205,
      "RESOLUTION",
      `${resolution.width} × ${resolution.height}`,
      () => this.cycleResolution(-1),
      () => this.cycleResolution(1),
    );
    this.createSegmentRow(
      layer,
      x + 52,
      y + 350,
      "FULLSCREEN",
      this.displaySettings.fullscreen,
      (enabled) => this.setFullscreen(enabled),
    );
    layer.add(
      this.add.text(x + 52, y + 505, "DESKTOP OUTPUT", {
        color: "#8a949e",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "bold",
        letterSpacing: 2,
      }),
    );
    layer.add(
      this.add.text(
        x + 258,
        y + 499,
        "WINDOW SIZE APPLIES WHEN FULLSCREEN IS OFF",
        {
          color: "#313b44",
          fontFamily: "Rajdhani",
          fontSize: "18px",
          fontStyle: "bold",
          letterSpacing: 0.9,
        },
      ),
    );
  }

  private renderGameplayPane(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
  ): void {
    this.createSegmentRow(
      layer,
      x + 52,
      y + 205,
      "SCREEN SHAKE",
      this.gameplaySettings.screenShake,
      (enabled) => this.setGameplayPreference("screenShake", enabled),
    );
    layer.add(
      this.add.text(
        x + 362,
        y + 257,
        "CAMERA IMPACT ON HEAVY HITS AND BURST ATTACKS",
        {
          color: "#8a949e",
          fontFamily: "Rajdhani",
          fontSize: "15px",
          fontStyle: "bold",
          letterSpacing: 1.1,
        },
      ),
    );
    this.createSegmentRow(
      layer,
      x + 52,
      y + 365,
      "DAMAGE NUMBERS",
      this.gameplaySettings.damageNumbers,
      (enabled) => this.setGameplayPreference("damageNumbers", enabled),
    );
    layer.add(
      this.add.text(
        x + 362,
        y + 417,
        "FLOATING DAMAGE VALUES // HEALING VALUES ALWAYS DISPLAY",
        {
          color: "#8a949e",
          fontFamily: "Rajdhani",
          fontSize: "15px",
          fontStyle: "bold",
          letterSpacing: 1.1,
        },
      ),
    );
  }

  private renderControlsPane(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
  ): void {
    CONTROL_BINDING_DEFINITIONS.forEach(({ action, label }, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const rowX = x + 52 + column * 620;
      const rowY = y + 155 + row * 64;
      layer.add(
        this.add
          .text(rowX, rowY, label, {
            color: "#37414a",
            fontFamily: "Rajdhani",
            fontSize: "18px",
            fontStyle: "bold",
            letterSpacing: 1,
          })
          .setOrigin(0, 0.5),
      );
      const capturing = this.capturingControl === action;
      const keyX = rowX + 300;
      const keyY = rowY - 27;
      const keycap = this.add.graphics();
      keycap.fillStyle(capturing ? 0xffd23f : 0xf4f6f8, 1);
      keycap.fillRect(keyX, keyY, 230, 54);
      keycap.lineStyle(1, capturing ? 0xd1a900 : 0xbec7ce, 1);
      keycap.strokeRect(keyX + 0.5, keyY + 0.5, 229, 53);
      keycap.fillStyle(capturing ? 0xd1a900 : 0x8f9aa4, 1);
      keycap.fillRect(keyX, keyY + 51, 230, 3);
      layer.add(keycap);
      layer.add(
        this.add
          .text(
            keyX + 115,
            rowY,
            capturing
              ? "PRESS KEY..."
              : formatControlBinding(this.controlSettings.bindings[action]),
            {
              color: capturing ? "#574700" : "#27313a",
              fontFamily: "Rajdhani",
              fontSize: "18px",
              fontStyle: "bold",
              letterSpacing: 1.1,
            },
          )
          .setOrigin(0.5),
      );
      const hitArea = this.add
        .rectangle(keyX, keyY, 230, 54, 0xffffff, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hitArea.on("pointerup", () => {
        if (!this.suppressBindingPointerUp) this.beginControlCapture(action);
      });
      layer.add(hitArea);
    });

    const resetX = x + 52;
    const resetY = y + 557;
    const resetWidth = 390;
    const resetHeight = 52;
    const reset = this.add.graphics();
    reset.fillStyle(0xffffff, 1);
    reset.fillRect(resetX, resetY, resetWidth, resetHeight);
    reset.lineStyle(1, 0xc63d35, 1);
    reset.strokeRect(
      resetX + 0.5,
      resetY + 0.5,
      resetWidth - 1,
      resetHeight - 1,
    );
    layer.add(reset);
    layer.add(
      this.add
        .text(
          resetX + resetWidth / 2,
          resetY + resetHeight / 2,
          "RESET BINDINGS TO DEFAULT",
          {
            color: "#bd352e",
            fontFamily: "Rajdhani",
            fontSize: "17px",
            fontStyle: "bold",
            letterSpacing: 1.2,
          },
        )
        .setOrigin(0.5),
    );
    const resetHit = this.add
      .rectangle(resetX, resetY, resetWidth, resetHeight, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    resetHit.on("pointerup", () => this.resetControlBindings());
    layer.add(resetHit);
    layer.add(
      this.add
        .text(
          x + 485,
          resetY + resetHeight / 2,
          "SELECT A KEYCAP, THEN PRESS A KEY OR MOUSE BUTTON. ESC CANCELS.",
          {
            color: "#8a949e",
            fontFamily: "Rajdhani",
            fontSize: "14px",
            fontStyle: "bold",
            letterSpacing: 1.6,
          },
        )
        .setOrigin(0, 0.5),
    );
  }

  private renderDataPane(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
  ): void {
    const available = saveStorageAvailable();
    const row = (label: string, rowY: number, text: string, color: string) => {
      layer.add(
        this.add.text(x + 52, rowY, label, {
          color: "#8a949e",
          fontFamily: "Rajdhani",
          fontSize: "14px",
          fontStyle: "bold",
          letterSpacing: 2,
        }),
      );
      layer.add(
        this.add.text(x + 256, rowY - 6, text, {
          color,
          fontFamily: "Rajdhani",
          fontSize: "19px",
          fontStyle: "bold",
          letterSpacing: 1,
          wordWrap: { width: 1000 },
        }),
      );
    };
    row(
      "SAVE LOCATION",
      y + 180,
      available
        ? "THIS BROWSER / DEVICE // PROGRESS SAVES AUTOMATICALLY"
        : "BLOCKED // THIS BROWSER IS NOT ALLOWING SAVED DATA",
      available ? "#313b44" : "#bd352e",
    );
    row(
      "BACKUP",
      y + 232,
      "EXPORT A SAVE FILE TO KEEP A BACKUP, OR TO MOVE PROGRESS BETWEEN THE BROWSER VERSION, THE DOWNLOAD AND OTHER COMPUTERS.",
      "#5d6872",
    );
    row("GAME VERSION", y + 306, `V${GAME_VERSION}`, "#313b44");

    const armed = this.time.now < this.eraseArmedUntil;
    this.createDataButton(layer, x + 52, y + 380, "EXPORT SAVE FILE", 0x1f8fe0, () =>
      this.exportSave(),
    );
    this.createDataButton(layer, x + 472, y + 380, "IMPORT SAVE FILE", 0x1f8fe0, () =>
      this.importSave(),
    );
    this.createDataButton(
      layer,
      x + 892,
      y + 380,
      armed ? "PRESS AGAIN TO ERASE EVERYTHING" : "ERASE ALL SAVED DATA",
      0xc63d35,
      () => this.eraseSave(),
    );
    if (this.dataMessage !== "") {
      layer.add(
        this.add.text(x + 52, y + 470, this.dataMessage, {
          color: "#26303a",
          fontFamily: "Rajdhani",
          fontSize: "18px",
          fontStyle: "bold",
          letterSpacing: 1,
          wordWrap: { width: 1250 },
        }),
      );
    }
    layer.add(
      this.add.text(
        x + 52,
        y + 560,
        "IMPORTING REPLACES THE CURRENT SAVE. ERASING REMOVES CORES, UNLOCKS, SKINS, RECORDS, ACHIEVEMENTS AND SETTINGS.",
        {
          color: "#8a949e",
          fontFamily: "Rajdhani",
          fontSize: "14px",
          fontStyle: "bold",
          letterSpacing: 1.6,
        },
      ),
    );
  }

  private createDataButton(
    layer: Phaser.GameObjects.Container,
    buttonX: number,
    buttonY: number,
    text: string,
    color: number,
    onClick: () => void,
  ): void {
    const width = 390;
    const height = 52;
    const surface = this.add.graphics();
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface.fillStyle(hovered ? color : 0xffffff, hovered ? 0.08 : 1);
      surface.fillRect(buttonX, buttonY, width, height);
      surface.lineStyle(1, color, 1);
      surface.strokeRect(buttonX + 0.5, buttonY + 0.5, width - 1, height - 1);
    };
    draw(false);
    layer.add(surface);
    layer.add(
      this.add
        .text(buttonX + width / 2, buttonY + height / 2, text, {
          color: `#${color.toString(16).padStart(6, "0")}`,
          fontFamily: "Rajdhani",
          fontSize: "17px",
          fontStyle: "bold",
          letterSpacing: 1.2,
        })
        .setOrigin(0.5),
    );
    const hitArea = this.add
      .rectangle(buttonX, buttonY, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hitArea.on("pointerover", () => draw(true));
    hitArea.on("pointerout", () => draw(false));
    hitArea.on("pointerup", () => {
      this.sound.play(AUDIO.confirm, {
        volume: scaledSfxVolume(0.18, this.audioSettings),
      });
      onClick();
    });
    layer.add(hitArea);
  }

  private exportSave(): void {
    const save = exportSaveData();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(save, null, 1)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `survivors-of-victory-save-v${GAME_VERSION}-${save.exportedAt.slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    this.dataMessage = `SAVE FILE EXPORTED (${Object.keys(save.entries).length} ENTRIES). CHECK YOUR DOWNLOADS FOLDER.`;
    this.renderContent();
  }

  private importSave(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file === undefined) return;
      void file.text().then((text) => {
        const result = importSaveData(text);
        if (result.ok) {
          // Every screen caches what it loaded, so restart on the imported profile.
          window.location.reload();
          return;
        }
        this.dataMessage = `IMPORT FAILED: ${result.reason.toUpperCase()}`;
        this.renderContent();
      });
    });
    input.click();
  }

  private eraseSave(): void {
    if (this.time.now >= this.eraseArmedUntil) {
      this.eraseArmedUntil = this.time.now + 4000;
      this.dataMessage =
        "THIS CANNOT BE UNDONE. EXPORT A BACKUP FIRST IF YOU MIGHT WANT IT BACK.";
      this.renderContent();
      this.time.delayedCall(4050, () => {
        if (
          this.currentCategory === "data" &&
          this.time.now >= this.eraseArmedUntil
        ) {
          this.dataMessage = "";
          this.renderContent();
        }
      });
      return;
    }
    eraseAllSaveData();
    window.location.reload();
  }

  private createChoiceRow(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    value: string,
    previous: () => void,
    next: () => void,
  ): void {
    layer.add(
      this.add
        .text(x, y, label, {
          color: "#29333c",
          fontFamily: "Rajdhani",
          fontSize: "22px",
          fontStyle: "bold",
          letterSpacing: 1.2,
        })
        .setOrigin(0, 0.5),
    );
    const fieldX = x + 310;
    const fieldWidth = 810;
    const field = this.add.graphics();
    field.fillStyle(0xf4f6f8, 1);
    field.fillRect(fieldX, y - 34, fieldWidth, 68);
    field.lineStyle(1, 0xbfc8cf, 1);
    field.strokeRect(fieldX + 0.5, y - 33.5, fieldWidth - 1, 67);
    field.fillStyle(0x202a33, 1);
    field.fillRect(fieldX, y - 34, 74, 68);
    field.fillRect(fieldX + fieldWidth - 74, y - 34, 74, 68);
    field.fillStyle(0xf1f5f7, 1);
    field.fillTriangle(
      fieldX + 43,
      y - 12,
      fieldX + 43,
      y + 12,
      fieldX + 29,
      y,
    );
    field.fillTriangle(
      fieldX + fieldWidth - 43,
      y - 12,
      fieldX + fieldWidth - 43,
      y + 12,
      fieldX + fieldWidth - 29,
      y,
    );
    layer.add(field);
    layer.add(
      this.add
        .text(fieldX + fieldWidth / 2, y, value, {
          color: "#313b44",
          fontFamily: "Rajdhani",
          fontSize: "22px",
          fontStyle: "bold",
          letterSpacing: 1.2,
        })
        .setOrigin(0.5),
    );
    const previousHit = this.add
      .rectangle(fieldX, y - 34, 74, 68, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    const nextHit = this.add
      .rectangle(fieldX + fieldWidth - 74, y - 34, 74, 68, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    previousHit.on("pointerup", previous);
    nextHit.on("pointerup", next);
    layer.add([previousHit, nextHit]);
  }

  private createSegmentRow(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    enabled: boolean,
    onChanged?: (enabled: boolean) => void,
  ): void {
    layer.add(
      this.add
        .text(x, y, label, {
          color: "#29333c",
          fontFamily: "Rajdhani",
          fontSize: "22px",
          fontStyle: "bold",
          letterSpacing: 1.2,
        })
        .setOrigin(0, 0.5),
    );
    const toggleX = x + 310;
    const toggleWidth = 510;
    const toggle = this.add.graphics();
    toggle.fillStyle(0xf4f6f8, 1);
    toggle.fillRect(toggleX, y - 32, toggleWidth, 64);
    toggle.lineStyle(1, 0xbfc8cf, 1);
    toggle.strokeRect(toggleX + 0.5, y - 31.5, toggleWidth - 1, 63);
    toggle.fillStyle(0x202a33, 1);
    toggle.fillRect(
      enabled ? toggleX : toggleX + toggleWidth / 2,
      y - 32,
      toggleWidth / 2,
      64,
    );
    layer.add(toggle);
    layer.add(
      this.add
        .text(toggleX + toggleWidth * 0.25, y, "ON", {
          color: enabled ? "#ffffff" : "#8a949e",
          fontFamily: "Rajdhani",
          fontSize: "18px",
          fontStyle: "bold",
          letterSpacing: 1.5,
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add
        .text(toggleX + toggleWidth * 0.75, y, "OFF", {
          color: enabled ? "#8a949e" : "#ffffff",
          fontFamily: "Rajdhani",
          fontSize: "18px",
          fontStyle: "bold",
          letterSpacing: 1.5,
        })
        .setOrigin(0.5),
    );
    if (onChanged !== undefined) {
      const onHit = this.add
        .rectangle(toggleX, y - 32, toggleWidth / 2, 64, 0xffffff, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      const offHit = this.add
        .rectangle(
          toggleX + toggleWidth / 2,
          y - 32,
          toggleWidth / 2,
          64,
          0xffffff,
          0,
        )
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      onHit.on("pointerup", () => onChanged(true));
      offHit.on("pointerup", () => onChanged(false));
      layer.add([onHit, offHit]);
    }
  }

  private cycleResolution(direction: -1 | 1): void {
    const current = SUPPORTED_RESOLUTIONS.findIndex(
      (candidate) =>
        candidate.width === this.displaySettings.resolution.width &&
        candidate.height === this.displaySettings.resolution.height,
    );
    const next = Phaser.Math.Wrap(
      current + direction,
      0,
      SUPPORTED_RESOLUTIONS.length,
    );
    this.displaySettings.resolution = { ...SUPPORTED_RESOLUTIONS[next]! };
    this.persistAndApplyDisplaySettings();
    this.sound.play(AUDIO.select, {
      volume: scaledSfxVolume(0.18, this.audioSettings),
    });
    this.renderContent();
  }

  private setFullscreen(enabled: boolean): void {
    if (enabled === this.displaySettings.fullscreen) {
      return;
    }
    this.displaySettings.fullscreen = enabled;
    this.persistAndApplyDisplaySettings();
    if (enabled) {
      this.scale.startFullscreen();
    } else if (this.scale.isFullscreen) {
      this.scale.stopFullscreen();
    }
    this.sound.play(AUDIO.confirm, {
      volume: scaledSfxVolume(0.2, this.audioSettings),
    });
    this.renderContent();
  }

  private persistAndApplyDisplaySettings(): void {
    saveDisplaySettings(this.displaySettings);
    window.dispatchEvent(
      new CustomEvent("sov:display-settings-changed", {
        detail: {
          fullscreen: this.displaySettings.fullscreen,
          height: this.displaySettings.resolution.height,
          width: this.displaySettings.resolution.width,
        },
      }),
    );
  }

  private setGameplayPreference(
    key: keyof GameplaySettings,
    enabled: boolean,
  ): void {
    if (this.gameplaySettings[key] === enabled) {
      return;
    }
    this.gameplaySettings[key] = enabled;
    saveGameplaySettings(this.gameplaySettings);
    this.sound.play(AUDIO.confirm, {
      volume: scaledSfxVolume(0.2, this.audioSettings),
    });
    this.renderContent();
  }

  private beginControlCapture(action: ControlAction): void {
    this.capturingControl = action;
    this.sound.play(AUDIO.select, {
      volume: scaledSfxVolume(0.16, this.audioSettings),
    });
    this.renderContent();
  }

  private handleSettingsKeyDown(event: KeyboardEvent): void {
    if (this.capturingControl === undefined) {
      const menuBinding = this.controlSettings.bindings.menu;
      if (
        menuBinding.device === "keyboard" &&
        event.keyCode === menuBinding.keyCode
      ) {
        event.preventDefault();
        this.leave();
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (
      event.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC &&
      this.capturingControl !== "menu"
    ) {
      this.capturingControl = undefined;
      this.renderContent();
      return;
    }
    if ([17, 18, 91, 92].includes(event.keyCode)) {
      return;
    }

    this.applyControlBinding({ device: "keyboard", keyCode: event.keyCode });
  }

  private handleSettingsPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.capturingControl === undefined) return;
    const button =
      pointer.button === 0 ? "LEFT" : pointer.button === 2 ? "RIGHT" : pointer.button === 1
        ? "MIDDLE"
        : pointer.button === 3
          ? "BACK"
          : pointer.button === 4
            ? "FORWARD"
            : undefined;
    if (button !== undefined) {
      this.suppressBindingPointerUp = true;
      this.input.once('pointerup', () => {
        this.time.delayedCall(0, () => { this.suppressBindingPointerUp = false; });
      });
      this.applyControlBinding({ button, device: "mouse" });
    }
  }

  private handleSettingsWheel(deltaY: number): void {
    if (this.capturingControl === undefined || deltaY === 0) return;
    if (this.capturingControl.startsWith('move')) return;
    this.applyControlBinding({
      button: deltaY < 0 ? "WHEEL UP" : "WHEEL DOWN",
      device: "mouse",
    });
  }

  private applyControlBinding(binding: ControlBinding): void {
    const action = this.capturingControl;
    if (action === undefined) return;
    const previousBinding = this.controlSettings.bindings[action];
    const conflicting = CONTROL_BINDING_DEFINITIONS.find(
      ({ action: candidate }) =>
        candidate !== action &&
        controlBindingsEqual(this.controlSettings.bindings[candidate], binding),
    );
    if (conflicting !== undefined) {
      this.controlSettings.bindings[conflicting.action] = previousBinding;
    }
    this.controlSettings.bindings[action] = binding;
    this.capturingControl = undefined;
    saveControlSettings(this.controlSettings);
    this.sound.play(AUDIO.confirm, {
      volume: scaledSfxVolume(0.2, this.audioSettings),
    });
    this.renderContent();
  }

  private resetControlBindings(): void {
    this.capturingControl = undefined;
    this.controlSettings = resetControlSettings();
    this.sound.play(AUDIO.confirm, {
      volume: scaledSfxVolume(0.2, this.audioSettings),
    });
    this.renderContent();
  }

  private leave(): void {
    if (!this.input.enabled) {
      return;
    }
    this.input.enabled = false;
    gameAudio.playUi(this, "back");
    const transitionProfile = nextNikkeTransitionProfile();
    playHexWipeCover(
      this,
      () => {
        this.scene.launch("main-menu", {
          previousScene: "settings",
          revealTransition: true,
          transitionProfile,
        });
      },
      transitionProfile,
    );
  }

  private setMenuMusicVolume(_value: number): void {
    gameAudio.updateMusicVolume();
  }
}

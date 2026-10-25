import Phaser from "phaser";

import { bindButtonInteraction } from "../ui/interaction/ButtonInteraction";

import {
  gameAudio,
  preloadLobbyAudio,
  preloadStageSelectAudio,
} from "../audio/GameAudio";
import { captureDevelopmentPreview } from "../dev/capturePreview";
import { deployMatch } from "../handoff";
import {
  CHARACTERS,
  loadRosterState,
  type CharacterDefinition,
} from "../profile/CharacterRoster";
import type { CharacterId } from "../profile/Ids";
import {
  MISSION_MODES,
  OPERATION_ZONES,
  type MissionModeDefinition,
  type MissionModeId,
  type OperationZoneDefinition,
  type StageSelection,
} from "../profile/StageData";
import {
  nextNikkeTransitionProfile,
  playHexWipeCover,
  playHexWipeReveal,
  type HexWipeProfile,
} from "../ui/transitions/HexWipeTransition";

const WIDTH = 1920;
const HEIGHT = 1080;
const CYAN = 0x35c5f2;
const YELLOW = 0xffd23f;
const RED = 0xe8392e;
const GODDESS_CRT_DISPLACEMENT_KEY = "stage-select-goddess-crt-displacement";

interface StageSelectSceneData {
  readonly characterId?: CharacterId;
  readonly previousScene?: string;
  readonly revealTransition?: boolean;
  readonly transitionProfile?: HexWipeProfile;
}

export class StageSelectScene extends Phaser.Scene {
  private armCrtBarrel?: Phaser.Filters.Barrel;
  private armCrtColor?: Phaser.Filters.ColorMatrix;
  private armCrtDisplacement?: Phaser.Filters.Displacement;
  private armCrtDisplacementTexture?: Phaser.Textures.CanvasTexture;
  private armCrtLastUpdate = 0;
  private armCrtPhase = 0;
  private armCrtVignette?: Phaser.Filters.Vignette;
  private armFxLayer?: Phaser.GameObjects.Container;
  private armScanY = -72;
  private backgroundImage?: Phaser.GameObjects.Image;
  private character: CharacterDefinition = CHARACTERS[0]!;
  private goddessFall = false;
  private hazardLayer?: Phaser.GameObjects.Container;
  private leaving = false;
  private mapLabelLayer?: Phaser.GameObjects.Container;
  private modeId: MissionModeId = MISSION_MODES[0]!.id;
  private modeLayer?: Phaser.GameObjects.Container;
  private startActionLayer?: Phaser.GameObjects.Container;
  private previousScene?: string;
  private revealTransition = false;
  private transitionProfile?: HexWipeProfile;
  private zoneIndex = 0;
  private zoneLayer?: Phaser.GameObjects.Container;

  public constructor() {
    super("stage-select");
  }

  public init(data: StageSelectSceneData = {}): void {
    // Returning from a run (?preview=stage-select) passes no data: use the last selected NIKKE.
    const characterId = data.characterId ?? loadRosterState().selectedCharacterId;
    this.character =
      CHARACTERS.find((character) => character.id === characterId) ??
      CHARACTERS[0]!;
    this.previousScene = data.previousScene;
    this.revealTransition = data.revealTransition ?? false;
    this.transitionProfile = data.transitionProfile;
    this.goddessFall = false;
    this.leaving = false;
    this.modeId = MISSION_MODES[0]!.id;
    this.zoneIndex = Phaser.Math.Between(0, OPERATION_ZONES.length - 1);
  }

  public preload(): void {
    OPERATION_ZONES.forEach((zone) =>
      this.load.image(this.zoneKey(zone), zone.previewPath),
    );
    this.load.image(this.operatorPortraitKey(), this.character.portraitPath);
    preloadLobbyAudio(this);
    preloadStageSelectAudio(this);
  }

  public create(): void {
    this.createBackground();
    this.createHeader();
    this.createOperatorChip();
    this.createBackButton();
    this.renderModes();
    this.renderHazard();
    this.renderMapIdentity();
    this.renderCarousel();
    this.renderStartAction();
    this.renderArmEffects();

    gameAudio.stopCharacterSelectionVoice();
    gameAudio.stopStageHazard();
    gameAudio.playLobby(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      gameAudio.stopStageHazard();
      this.destroyGoddessCrtEffects();
    });
    this.input.keyboard?.on("keydown-ESC", () => this.back());
    this.input.keyboard?.on("keydown-LEFT", () => this.stepZone(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.stepZone(1));
    if (this.revealTransition) {
      playHexWipeReveal(this, this.transitionProfile ?? "MISSION BRIEFING");
      if (this.previousScene !== undefined) this.scene.stop(this.previousScene);
    } else {
      this.cameras.main.fadeIn(220, 7, 11, 16);
    }
    captureDevelopmentPreview(this, "stage-select");
  }

  private createBackground(): void {
    const zone = this.currentZone();
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x0e1116).setOrigin(0);
    this.backgroundImage = this.add.image(
      WIDTH / 2,
      HEIGHT / 2,
      this.zoneKey(zone),
    );
    this.fitBackground();
    this.backgroundImage.setTint(0xccccd6);

    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x071019, 0.24).setOrigin(0);
    const shade = this.add.graphics();
    shade.fillStyle(0x071019, 0.62).fillRect(0, 820, WIDTH, 260);
    const scan = this.add.graphics().setDepth(7);
    for (let y = 0; y < HEIGHT; y += 4) {
      scan.fillStyle(0x01060a, 0.11).fillRect(0, y, WIDTH, 2);
      scan.fillStyle(0xffffff, 0.018).fillRect(0, y + 2, WIDTH, 1);
    }
  }

  private createHeader(): void {
    this.add
      .text(66, 35, "MISSION SELECT", {
        color: "#f2f5f7",
        fontFamily: "Rajdhani",
        fontSize: "56px",
        fontStyle: "bold",
        letterSpacing: 2,
      })
      .setDepth(30);
    this.add
      .text(69, 111, "CHOOSE OPERATION ZONE", {
        color: "#a9b4bd",
        fontFamily: "Rajdhani",
        fontSize: "17px",
        fontStyle: "bold",
        letterSpacing: 3,
      })
      .setDepth(30);
    const bar = this.add.graphics().setDepth(30);
    bar.fillStyle(CYAN, 1).fillRect(69, 150, 81, 4);
    bar.fillStyle(0xffffff, 0.2).fillRect(150, 151, 500, 1);
  }

  private createOperatorChip(): void {
    const x = 1360;
    const y = 33;
    const width = 310;
    const height = 57;
    const root = this.add.container(0, 0).setDepth(31);
    const surface = this.add.graphics();
    surface.fillStyle(0x0e151d, 0.86).fillRect(x, y, width, height);
    surface
      .lineStyle(1, 0xffffff, 0.25)
      .strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    surface.fillStyle(this.character.accent, 1).fillRect(x, y, 5, height);
    const portrait = this.add
      .image(x + 36, y + height / 2, this.operatorPortraitKey())
      .setDisplaySize(48, 48);
    const cap = this.add.text(x + 70, y + 9, "OPERATOR // ACTIVE", {
      color: "#8f9aa4",
      fontFamily: "Rajdhani",
      fontSize: "12px",
      fontStyle: "bold",
      letterSpacing: 1.4,
    });
    const name = this.add.text(x + 70, y + 27, this.character.name, {
      color: "#f2f5f7",
      fontFamily: "Rajdhani",
      fontSize: "20px",
      fontStyle: "bold",
      letterSpacing: 0.8,
    });
    root.add([surface, portrait, cap, name]);
  }

  private createBackButton(): void {
    const x = 1688;
    const y = 33;
    const width = 178;
    const height = 57;
    const root = this.add.container(0, 0).setDepth(31);
    const surface = this.add.graphics();
    const arrow = this.add.graphics();
    arrow.lineStyle(3, 0xe9f0f4, 1);
    arrow.lineBetween(x + 25, y + 28, x + 43, y + 17);
    arrow.lineBetween(x + 25, y + 28, x + 43, y + 39);
    arrow.lineBetween(x + 25, y + 28, x + 57, y + 28);
    const label = this.add
      .text(x + 108, y + 28, "BACK", {
        color: "#f2f5f7",
        fontFamily: "Rajdhani",
        fontSize: "21px",
        fontStyle: "bold",
        letterSpacing: 1.2,
      })
      .setOrigin(0.5);
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(hovered ? 0x21313d : 0x0e151d, 0.9)
        .fillRect(x, y, width, height);
      surface
        .lineStyle(1, hovered ? CYAN : 0xffffff, hovered ? 1 : 0.25)
        .strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    };
    draw(false);
    const hit = this.add
      .rectangle(x, y, width, height, 0xffffff, 0)
      .setOrigin(0);
    bindButtonInteraction(hit, { draw, onActivate: () => this.back() });
    root.add([surface, arrow, label, hit]);
  }

  private renderModes(): void {
    this.modeLayer?.destroy(true);
    const root = this.add.container(0, 0).setDepth(20);
    this.modeLayer = root;
    MISSION_MODES.forEach((mode, index) =>
      root.add(this.createModeButton(mode, 66, 192 + index * 133)),
    );
  }

  private createModeButton(
    mode: MissionModeDefinition,
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const width = 450;
    const height = 118;
    const selected = mode.id === this.modeId;
    const root = this.add.container(0, 0);
    const surface = this.add.graphics();
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface.fillStyle(
        selected ? 0x17354a : hovered ? 0x1b2934 : 0x141a22,
        selected ? 0.92 : 0.82,
      );
      surface.fillPoints(
        [
          new Phaser.Math.Vector2(x, y),
          new Phaser.Math.Vector2(x + width, y),
          new Phaser.Math.Vector2(x + width, y + height - 16),
          new Phaser.Math.Vector2(x + width - 16, y + height),
          new Phaser.Math.Vector2(x, y + height),
        ],
        true,
      );
      surface.lineStyle(
        1,
        selected || hovered ? CYAN : 0xffffff,
        selected || hovered ? 1 : 0.2,
      );
      surface.strokePoints(
        [
          new Phaser.Math.Vector2(x, y),
          new Phaser.Math.Vector2(x + width, y),
          new Phaser.Math.Vector2(x + width, y + height - 16),
          new Phaser.Math.Vector2(x + width - 16, y + height),
          new Phaser.Math.Vector2(x, y + height),
        ],
        true,
        true,
      );
      if (selected) surface.fillStyle(CYAN, 1).fillRect(x, y, 6, height);
    };
    draw(false);
    const title = this.add.text(x + 26, y + 18, mode.name, {
      color: selected ? "#35c5f2" : "#f3f6f8",
      fontFamily: "Rajdhani",
      fontSize: "32px",
      fontStyle: "bold",
      letterSpacing: 1.1,
    });
    const description = this.add.text(x + 27, y + 61, mode.description, {
      color: "#aab4bd",
      fontFamily: "Rajdhani",
      fontSize: "16px",
      fontStyle: "500",
      lineSpacing: 3,
      wordWrap: { width: 382 },
    });
    const hit = this.add
      .rectangle(x, y, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerup", () => {
      if (!selected) {
        this.modeId = mode.id;
        gameAudio.playUi(this, "select");
        this.renderModes();
      }
    });
    root.add([surface, title, description, hit]);
    return root;
  }

  private renderHazard(): void {
    this.hazardLayer?.destroy(true);
    const root = this.add.container(0, 0).setDepth(20);
    this.hazardLayer = root;
    const x = 66;
    const y = 473;
    const width = 450;
    const height = 92;
    const surface = this.add.graphics();
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(
          this.goddessFall ? 0x5d100d : 0x141a22,
          this.goddessFall ? 0.76 : 0.82,
        )
        .fillRect(x, y, width, height);
      surface
        .lineStyle(1, RED, hovered || this.goddessFall ? 1 : 0.58)
        .strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
      for (let stripeY = y - 12; stripeY < y + height + 12; stripeY += 22) {
        surface.fillStyle(RED, 1);
        surface.fillTriangle(
          x,
          stripeY + 12,
          x + 12,
          stripeY,
          x + 12,
          stripeY + 10,
        );
      }
      const switchX = x + width - 88;
      surface.lineStyle(1, RED, 0.75).strokeRect(switchX, y + 31, 62, 30);
      surface
        .fillStyle(this.goddessFall ? RED : 0x59636c, 1)
        .fillRect(switchX + (this.goddessFall ? 37 : 5), y + 36, 20, 20);
    };
    draw(false);
    const alert = this.add
      .text(x + 31, y + 30, "!", {
        color: "#e8392e",
        fontFamily: "Rajdhani",
        fontSize: "34px",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    const title = this.add.text(x + 60, y + 20, "GODDESS FALL", {
      color: this.goddessFall ? "#ffffff" : "#ff6b61",
      fontFamily: "Rajdhani",
      fontSize: "23px",
      fontStyle: "bold",
      letterSpacing: 1,
    });
    const description = this.add.text(
      x + 61,
      y + 52,
      "Hardcore protocol. She descends.",
      {
        color: "#aeb6bd",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "500",
      },
    );
    const hit = this.add
      .rectangle(x, y, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerup", () => {
      this.goddessFall = !this.goddessFall;
      gameAudio.playUi(this, this.goddessFall ? "select" : "back");
      if (this.goddessFall) gameAudio.playStageHazard(this);
      else {
        gameAudio.stopStageHazard();
        gameAudio.playLobby(this);
      }
      this.renderHazard();
      this.renderStartAction();
      this.renderArmEffects();
    });
    root.add([surface, alert, title, description, hit]);
  }

  private renderMapIdentity(): void {
    this.mapLabelLayer?.destroy(true);
    const zone = this.currentZone();
    const root = this.add.container(0, 0).setDepth(18);
    this.mapLabelLayer = root;
    const name = this.add.text(69, 680, zone.name, {
      color: "#f5f7f9",
      fontFamily: "Rajdhani",
      fontSize: zone.name.length > 18 ? "66px" : "76px",
      fontStyle: "bold",
      letterSpacing: 1.2,
      shadow: { color: "#000000", blur: 12, offsetY: 3 },
    });
    const subtitle = this.add.text(72, 778, zone.subtitle, {
      color: this.goddessFall ? "#ff6b61" : "#35c5f2",
      fontFamily: "Rajdhani",
      fontSize: "20px",
      fontStyle: "bold",
      letterSpacing: 4,
    });
    const counter = this.add.text(
      72 + subtitle.width + 24,
      782,
      `ZONE ${String(this.zoneIndex + 1).padStart(2, "0")} // ${String(OPERATION_ZONES.length).padStart(2, "0")}`,
      {
        color: "#aeb6bd",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 2,
      },
    );
    root.add([name, subtitle, counter]);
  }

  private renderCarousel(direction = 0): void {
    this.zoneLayer?.destroy(true);
    const root = this.add.container(0, 0).setDepth(19);
    this.zoneLayer = root;
    const centerX = 668;
    const y = 858;
    const pitch = 252;
    OPERATION_ZONES.forEach((zone, index) => {
      const relative = this.circularDelta(
        index,
        this.zoneIndex,
        OPERATION_ZONES.length,
      );
      root.add(
        this.createZoneThumbnail(
          zone,
          index,
          centerX + relative * pitch,
          y,
          relative === 0,
        ),
      );
    });
    root.add(this.createCarouselArrow(9, 869, -1));
    root.add(this.createCarouselArrow(1230, 869, 1));
    if (direction !== 0) {
      root.x = direction * 24;
      root.setAlpha(0.72);
      this.tweens.add({
        alpha: 1,
        duration: 180,
        ease: "Cubic.Out",
        targets: root,
        x: 0,
      });
    }
  }

  private createZoneThumbnail(
    zone: OperationZoneDefinition,
    index: number,
    centerX: number,
    y: number,
    selected: boolean,
  ): Phaser.GameObjects.Container {
    const width = 240;
    const height = 114;
    const root = this.add.container(0, 0).setAlpha(selected ? 1 : 0.5);
    const image = this.add
      .image(centerX, y + height / 2, this.zoneKey(zone))
      .setDisplaySize(width, height);
    const shade = this.add
      .rectangle(
        centerX - width / 2,
        y + height - 29,
        width,
        29,
        0x090d12,
        0.84,
      )
      .setOrigin(0);
    const border = this.add.graphics();
    border
      .lineStyle(
        selected ? 3 : 1,
        selected ? YELLOW : 0xffffff,
        selected ? 1 : 0.35,
      )
      .strokeRect(centerX - width / 2 + 0.5, y + 0.5, width - 1, height - 1);
    const label = this.add.text(
      centerX - width / 2 + 13,
      y + height - 22,
      zone.name,
      {
        color: "#ffffff",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "bold",
        letterSpacing: 0.5,
      },
    );
    const sub = this.add
      .text(centerX + width / 2 - 12, y + height - 21, zone.subtitle, {
        color: "#35c5f2",
        fontFamily: "Rajdhani",
        fontSize: "12px",
        fontStyle: "bold",
        letterSpacing: 0.8,
      })
      .setOrigin(1, 0);
    const hit = this.add
      .rectangle(centerX - width / 2, y, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerup", () => this.selectZone(index));
    root.add([image, shade, border, label, sub, hit]);
    return root;
  }

  private createCarouselArrow(
    x: number,
    y: number,
    direction: -1 | 1,
  ): Phaser.GameObjects.Container {
    const width = 52;
    const height = 102;
    const root = this.add.container(0, 0);
    const surface = this.add.graphics();
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(hovered ? 0x1f8fe0 : 0x0b1118, hovered ? 0.72 : 0.88)
        .fillRect(x, y, width, height);
      surface
        .lineStyle(1, hovered ? CYAN : 0xffffff, hovered ? 1 : 0.35)
        .strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
      surface.lineStyle(4, 0xffffff, 1);
      const cx = x + width / 2;
      const cy = y + height / 2;
      surface.lineBetween(cx + direction * -8, cy - 13, cx + direction * 8, cy);
      surface.lineBetween(cx + direction * 8, cy, cx + direction * -8, cy + 13);
    };
    draw(false);
    const hit = this.add
      .rectangle(x, y, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerup", () => this.stepZone(direction));
    root.add([surface, hit]);
    return root;
  }

  private renderStartAction(): void {
    this.startActionLayer?.destroy(true);
    const root = this.add.container(0, 0).setDepth(21);
    this.startActionLayer = root;
    // Share the map carousel's visual row without wrapping the action in a
    // second panel. The button center aligns with the 114px map thumbnails.
    root.add(this.createStartButton(1314, 872, 552, 86));
  }

  private createStartButton(
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.Container {
    const root = this.add.container(0, 0);
    const surface = this.add.graphics();
    const draw = (hovered: boolean): void => {
      const color = this.goddessFall
        ? hovered
          ? 0xf0584d
          : RED
        : hovered
          ? 0x5bd2f7
          : 0x238eb8;
      surface.clear();
      surface.fillStyle(color, 1);
      surface.fillPoints(
        [
          new Phaser.Math.Vector2(x, y),
          new Phaser.Math.Vector2(x + width, y),
          new Phaser.Math.Vector2(x + width, y + height - 18),
          new Phaser.Math.Vector2(x + width - 18, y + height),
          new Phaser.Math.Vector2(x, y + height),
        ],
        true,
      );
      surface
        .fillStyle(this.goddessFall ? 0x8b1710 : 0x15679f, 1)
        .fillRect(x, y + height - 4, width - 18, 4);
    };
    draw(false);
    const label = this.add
      .text(
        x + width / 2,
        y + height / 2,
        this.goddessFall ? "SHE DESCENDS" : "MISSION START",
        {
          color: "#ffffff",
          fontFamily: "Rajdhani",
          fontSize: "31px",
          fontStyle: "bold",
          letterSpacing: 1.3,
        },
      )
      .setOrigin(0.5);
    const hit = this.add
      .rectangle(x, y, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerup", () => this.startMission());
    root.add([surface, label, hit]);
    return root;
  }

  private renderArmEffects(): void {
    this.destroyGoddessCrtEffects();
    if (this.armFxLayer !== undefined) {
      this.tweens.killTweensOf(this.armFxLayer.getAll());
    }
    this.armFxLayer?.destroy(true);
    this.armFxLayer = undefined;
    this.armScanY = -72;
    this.backgroundImage?.setTint(this.goddessFall ? 0xff8178 : 0xccccd6);
    this.renderMapIdentity();
    if (!this.goddessFall) return;
    const root = this.add.container(0, 0).setDepth(8);
    this.armFxLayer = root;
    const fullScreenTint = this.add
      .rectangle(0, 0, WIDTH, HEIGHT, RED, 0.11)
      .setOrigin(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    const pulse = this.add
      .rectangle(0, 0, WIDTH, HEIGHT, 0xff5147, 0.08)
      .setOrigin(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    const scanBand = this.add.container(0, this.armScanY);
    const bandShade = this.add
      .rectangle(0, 0, WIDTH, 68, 0x240000, 0.14)
      .setOrigin(0);
    const topEdge = this.add
      .rectangle(0, 0, WIDTH, 3, 0xff8a83, 0.68)
      .setOrigin(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    const hotCore = this.add
      .rectangle(0, 27, WIDTH, 9, 0xff4037, 0.22)
      .setOrigin(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    const bottomEdge = this.add
      .rectangle(0, 66, WIDTH, 2, 0xb80f09, 0.62)
      .setOrigin(0);
    const glitchA = this.add
      .rectangle(112, 14, 420, 3, 0xff8b84, 0.38)
      .setOrigin(0);
    const glitchB = this.add
      .rectangle(760, 35, 610, 2, 0xff5b52, 0.32)
      .setOrigin(0);
    const glitchC = this.add
      .rectangle(1515, 20, 270, 4, 0xff8b84, 0.28)
      .setOrigin(0);
    scanBand.add([
      bandShade,
      topEdge,
      hotCore,
      bottomEdge,
      glitchA,
      glitchB,
      glitchC,
    ]);
    root.add(scanBand);
    this.createGoddessCrtEffects();
    this.updateGoddessCrtDisplacement(this.armScanY, true);
    const bannerSurface = this.add
      .rectangle(660, 124, 600, 48, 0x780804, 0.9)
      .setOrigin(0)
      .setStrokeStyle(1, RED, 1);
    const banner = this.add
      .text(960, 148, "SHE DESCENDS PROTOCOL ARMED", {
        color: "#ffb4ae",
        fontFamily: "Rajdhani",
        fontSize: "19px",
        fontStyle: "bold",
        letterSpacing: 4,
      })
      .setOrigin(0.5);
    root.addAt(fullScreenTint, 0);
    root.addAt(pulse, 1);
    root.add([bannerSurface, banner]);
    this.tweens.add({
      alpha: { from: 0.35, to: 1 },
      duration: 1100,
      repeat: -1,
      yoyo: true,
      targets: pulse,
    });
    this.tweens.add({
      duration: 2850,
      ease: "Sine.InOut",
      onUpdate: () => {
        this.armScanY = scanBand.y;
        this.updateGoddessCrtDisplacement(scanBand.y);
      },
      repeat: -1,
      targets: scanBand,
      y: HEIGHT + 72,
    });
  }

  private createGoddessCrtEffects(): void {
    if (this.textures.exists(GODDESS_CRT_DISPLACEMENT_KEY)) {
      this.textures.remove(GODDESS_CRT_DISPLACEMENT_KEY);
    }
    const texture = this.textures.createCanvas(
      GODDESS_CRT_DISPLACEMENT_KEY,
      256,
      144,
    );
    if (texture === null) return;
    this.armCrtDisplacementTexture = texture;
    const image = this.backgroundImage;
    if (image === undefined) return;
    image.enableFilters();
    const filters = image.filters?.internal;
    if (filters === undefined) return;
    this.armCrtBarrel = filters.addBarrel(1.014);
    this.armCrtDisplacement = filters.addDisplacement(
      GODDESS_CRT_DISPLACEMENT_KEY,
      0.018,
      0.0025,
    );
    this.armCrtColor = filters.addColorMatrix();
    this.armCrtColor.colorMatrix
      .contrast(0.06)
      .saturate(0.08, true)
      .brightness(1.04, true);
    this.armCrtVignette = filters.addVignette(
      0.5,
      0.5,
      0.94,
      0.2,
      0x2c0000,
      Phaser.BlendModes.MULTIPLY,
    );
  }

  private updateGoddessCrtDisplacement(scanY: number, force = false): void {
    const texture = this.armCrtDisplacementTexture;
    if (texture === undefined) return;
    const now = this.time.now;
    if (!force && now - this.armCrtLastUpdate < 32) return;
    this.armCrtLastUpdate = now;
    this.armCrtPhase += 0.17;
    const width = texture.width;
    const height = texture.height;
    const bandY = (scanY / HEIGHT) * height;
    const context = texture.getContext();
    const imageData = context.createImageData(width, height);
    const pixels = imageData.data;
    for (let y = 0; y < height; y += 1) {
      const distance = Math.abs(y - bandY);
      const bandStrength = Math.max(0, 1 - distance / 12);
      const rowWave =
        Math.sin(y * 0.31 + this.armCrtPhase) * 5 +
        Math.sin(y * 0.073 - this.armCrtPhase * 0.7) * 3 +
        bandStrength *
          (Math.sin(y * 1.73 + this.armCrtPhase * 2.2) * 46 +
            Math.sin(y * 0.41) * 12);
      const verticalWarp =
        Math.sin(y * 0.19 - this.armCrtPhase) * 1.5 +
        bandStrength * Math.sin(y * 1.11) * 8;
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const fineNoise = Math.sin(x * 0.13 + y * 0.27 + this.armCrtPhase) * 3;
        pixels[index] = Phaser.Math.Clamp(
          Math.round(128 + rowWave + fineNoise),
          0,
          255,
        );
        pixels[index + 1] = Phaser.Math.Clamp(
          Math.round(128 + verticalWarp),
          0,
          255,
        );
        pixels[index + 2] = 128;
        pixels[index + 3] = 255;
      }
    }
    texture.putData(imageData, 0, 0).refresh();
    if (this.armCrtDisplacement !== undefined) {
      this.armCrtDisplacement.x =
        0.018 + Math.sin(this.armCrtPhase * 0.43) * 0.002;
    }
  }

  private destroyGoddessCrtEffects(): void {
    const filters = this.backgroundImage?.filters?.internal;
    for (const filter of [
      this.armCrtBarrel,
      this.armCrtDisplacement,
      this.armCrtColor,
      this.armCrtVignette,
    ]) {
      if (
        filter !== undefined &&
        filters !== undefined &&
        filters.list.includes(filter)
      ) {
        filters.remove(filter, true);
      }
    }
    this.armCrtBarrel = undefined;
    this.armCrtDisplacement = undefined;
    this.armCrtColor = undefined;
    this.armCrtVignette = undefined;
    this.armCrtDisplacementTexture = undefined;
    this.armCrtLastUpdate = 0;
    this.armCrtPhase = 0;
    if (this.textures.exists(GODDESS_CRT_DISPLACEMENT_KEY)) {
      this.textures.remove(GODDESS_CRT_DISPLACEMENT_KEY);
    }
  }

  private selectZone(index: number): void {
    const normalized = Phaser.Math.Wrap(index, 0, OPERATION_ZONES.length);
    if (normalized === this.zoneIndex) return;
    const direction =
      this.circularDelta(normalized, this.zoneIndex, OPERATION_ZONES.length) >=
      0
        ? 1
        : -1;
    this.zoneIndex = normalized;
    gameAudio.playUi(this, "select");
    this.updateBackground();
    this.renderMapIdentity();
    this.renderCarousel(direction);
  }

  private stepZone(direction: -1 | 1): void {
    if (this.leaving) return;
    this.selectZone(this.zoneIndex + direction);
  }

  private updateBackground(): void {
    const image = this.backgroundImage;
    if (image === undefined) return;
    this.tweens.killTweensOf(image);
    this.tweens.add({
      alpha: 0.55,
      duration: 110,
      onComplete: () => {
        image.setTexture(this.zoneKey(this.currentZone()));
        this.fitBackground();
        this.tweens.add({
          alpha: 1,
          duration: 240,
          ease: "Cubic.Out",
          targets: image,
        });
      },
      targets: image,
    });
  }

  private startMission(): void {
    if (this.leaving || !this.input.enabled) return;
    this.leaving = true;
    this.input.enabled = false;
    gameAudio.stopStageHazard();
    gameAudio.playUi(this, "confirm");
    const zone = this.currentZone();
    const stageSelection: StageSelection = {
      biome: zone.biome,
      difficulty: 1,
      goddessFall: this.goddessFall,
      modeId: this.modeId,
      time: zone.time,
      zoneId: zone.id,
    };
    // The covered screen hands the page to the Babylon match (src/frontend/handoff.ts).
    playHexWipeCover(
      this,
      () => {
        gameAudio.stopMusic();
        deployMatch({ characterId: this.character.id, stageSelection });
      },
      nextNikkeTransitionProfile(),
    );
  }

  private back(): void {
    if (this.leaving || !this.input.enabled) return;
    this.leaving = true;
    this.input.enabled = false;
    gameAudio.stopStageHazard();
    gameAudio.playUi(this, "back");
    const transitionProfile = nextNikkeTransitionProfile();
    playHexWipeCover(
      this,
      () => {
        this.scene.launch("character-select", {
          previousScene: "stage-select",
          revealTransition: true,
          transitionProfile,
        });
      },
      transitionProfile,
    );
  }

  private currentZone(): OperationZoneDefinition {
    return OPERATION_ZONES[this.zoneIndex] ?? OPERATION_ZONES[0]!;
  }

  private circularDelta(
    index: number,
    selected: number,
    count: number,
  ): number {
    return Phaser.Math.Wrap(index - selected + count / 2, 0, count) - count / 2;
  }

  private fitBackground(): void {
    const image = this.backgroundImage;
    if (image === undefined) return;
    this.fitStageBackgroundImage(image);
  }

  private fitStageBackgroundImage(image: Phaser.GameObjects.Image): void {
    const texture = image.texture.getSourceImage() as {
      height: number;
      width: number;
    };
    const scale = Math.max(WIDTH / texture.width, HEIGHT / texture.height);
    image.setDisplaySize(texture.width * scale, texture.height * scale);
  }

  private operatorPortraitKey(): string {
    return `stage-select-${this.character.id}-portrait`;
  }

  private zoneKey(zone: OperationZoneDefinition): string {
    return `stage-select-zone-${zone.id}`;
  }
}

import Phaser from "phaser";
import { bleed, pinToEdge, view } from "../rendering/DisplayQualityPlugin";

import { gameAudio, preloadLobbyAudio } from "../audio/GameAudio";
import { bindButtonInteraction } from "../ui/interaction/ButtonInteraction";
import { captureDevelopmentPreview } from "../dev/capturePreview";
import {
  type AchievementCategory,
  type AchievementProgressEntry,
  type AchievementSnapshot,
  ACHIEVEMENT_OPERATORS,
  loadAchievementSnapshot,
} from "../profile/AchievementProgress";
import { CHARACTERS, STARTER_CHARACTER_ID } from "../profile/CharacterRoster";
import type { CharacterId } from "../profile/Ids";
import {
  type AudioSettings,
  loadAudioSettings,
  scaledSfxVolume,
} from "../settings/GameSettings";
import {
  nextNikkeTransitionProfile,
  playHexWipeCover,
  playHexWipeReveal,
  type HexWipeProfile,
} from "../ui/transitions/HexWipeTransition";

const WIDTH = 1920;
const HEIGHT = 1080;

const AUDIO = {
  confirm: "achievements-confirm",
  select: "achievements-select",
} as const;

interface AchievementsSceneData {
  readonly previousScene?: string;
  readonly revealTransition?: boolean;
  readonly transitionProfile?: HexWipeProfile;
}

interface CategoryDefinition {
  readonly description: string;
  readonly id: AchievementCategory;
  readonly index: string;
  readonly title: string;
}

const CATEGORIES: readonly CategoryDefinition[] = [
  {
    description: "RAPTURE ENGAGEMENTS",
    id: "combat",
    index: "01",
    title: "COMBAT",
  },
  {
    description: "ROUND & REGION MILESTONES",
    id: "expedition",
    index: "02",
    title: "SURVIVAL",
  },
  {
    description: "OPERATOR PROGRESSION",
    id: "mastery",
    index: "03",
    title: "OPERATORS",
  },
] as const;

export class AchievementsScene extends Phaser.Scene {
  private audioSettings: AudioSettings = loadAudioSettings();
  private categoryLayer?: Phaser.GameObjects.Container;
  private contentLayer?: Phaser.GameObjects.Container;
  private currentCategory: AchievementCategory = "combat";
  private currentOperator: CharacterId = STARTER_CHARACTER_ID;
  private leaving = false;
  private previousScene?: string;
  private revealTransition = false;
  private snapshot: AchievementSnapshot = loadAchievementSnapshot();
  private transitionProfile?: HexWipeProfile;

  public constructor() {
    super("achievements");
  }

  public init(data: AchievementsSceneData = {}): void {
    this.categoryLayer = undefined;
    this.contentLayer = undefined;
    this.leaving = false;
    this.previousScene = data.previousScene;
    this.revealTransition = data.revealTransition ?? false;
    this.transitionProfile = data.transitionProfile;
  }

  public preload(): void {
    this.load.audio(AUDIO.select, "assets/audio/ui/select.wav");
    this.load.audio(AUDIO.confirm, "assets/audio/ui/confirm.wav");
    preloadLobbyAudio(this);
  }

  public create(): void {
    this.audioSettings = loadAudioSettings();
    this.snapshot = loadAchievementSnapshot();
    const requestedCategory = new URLSearchParams(window.location.search).get(
      "achievements",
    );
    if (CATEGORIES.some((category) => category.id === requestedCategory)) {
      this.currentCategory = requestedCategory as AchievementCategory;
    }
    this.createBackdrop();
    this.createHeader();
    this.createSummary();
    this.createBackButton();
    this.renderCategoryRail();
    this.renderAchievements();
    gameAudio.stopEnvironmentAmbience();
    gameAudio.playLobby(this);
    this.input.keyboard?.on("keydown-ESC", () => this.leave());

    if (this.revealTransition) {
      playHexWipeReveal(this, this.transitionProfile ?? "RECORDS");
      if (this.previousScene !== undefined) {
        this.scene.stop(this.previousScene);
      }
    } else {
      this.cameras.main.fadeIn(260, 8, 13, 18);
    }
    captureDevelopmentPreview(this, `achievements-${this.currentCategory}`);
  }

  private createBackdrop(): void {
    this.add.rectangle(bleed.left, 0, bleed.width, HEIGHT, 0xe9edf1).setOrigin(0);
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x81909c, 0.085);
    for (let x = bleed.left - 420; x < bleed.right + 420; x += 205) {
      grid.lineBetween(x, 76, x + 430, HEIGHT - 48);
    }
    grid.lineStyle(1, 0x81909c, 0.055);
    for (let y = 180; y < HEIGHT - 70; y += 122) {
      grid.lineBetween(bleed.left, y, bleed.right, y);
    }

    const chrome = this.add.graphics();
    chrome.fillStyle(0x090d12, 0.97).fillRect(bleed.left, 0, bleed.width, 76);
    chrome.fillRect(bleed.left, HEIGHT - 48, bleed.width, 48);
    chrome.fillStyle(0x35c5f2, 1).fillRect(bleed.left, 74, 515 - bleed.left, 3);
    chrome.fillStyle(0xaeb7c1, 0.28).fillRect(515, 75, bleed.right - 515, 1);
    chrome.fillStyle(0xe8392e, 1).fillRect(1450, 74, bleed.right - 1450, 3);

    pinToEdge(this.add.text(view.left + 52, 25, "ARK SYSTEM / SERVICE RECORD", {
      color: "#f2f5f7",
      fontFamily: "Rajdhani",
      fontSize: "26px",
      fontStyle: "bold",
      letterSpacing: 1.8,
    }), "left");
    pinToEdge(this.add.text(view.right - 146, 26, "03", {
      color: "#9aa4af",
      fontFamily: "Rajdhani",
      fontSize: "25px",
      fontStyle: "bold",
    }), "right");
    pinToEdge(this.add.text(view.left + 52, 1038, "COMMAND DOSSIER // LOCAL PROFILE 01", {
      color: "#8a949f",
      fontFamily: "Rajdhani",
      fontSize: "15px",
      fontStyle: "bold",
      letterSpacing: 2,
    }), "left");
    pinToEdge(this.add
      .text(view.right - 102, 1038, "PROGRESS SAVED AUTOMATICALLY", {
        color: "#35c5f2",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 1.4,
      }), "right")
      .setOrigin(1, 0);
  }

  private createHeader(): void {
    this.add.text(70, 112, "ACHIEVEMENTS", {
      color: "#20262d",
      fontFamily: "Rajdhani",
      fontSize: "60px",
      fontStyle: "bold",
      letterSpacing: 2,
    });
    this.add.text(73, 181, "COMMANDER DOSSIER // VERIFIED FIELD MILESTONES", {
      color: "#707b86",
      fontFamily: "Rajdhani",
      fontSize: "17px",
      fontStyle: "bold",
      letterSpacing: 2.6,
    });
    const marker = this.add.graphics();
    marker.fillStyle(0x35c5f2, 1).fillRect(73, 216, 82, 4);
    marker.fillStyle(0x76828d, 0.28).fillRect(155, 217, 335, 1);
  }

  private createSummary(): void {
    const panel = this.add.graphics();
    panel.fillStyle(0x202832, 1).fillRect(722, 110, 716, 110);
    panel.lineStyle(1, 0x53606b, 1).strokeRect(722.5, 110.5, 715, 109);
    panel.fillStyle(0x35c5f2, 1).fillRect(722, 216, 716, 4);
    panel.fillStyle(0x43505b, 1).fillRect(955, 129, 1, 70);
    panel.fillRect(1192, 129, 1, 70);

    const percent =
      this.snapshot.total === 0
        ? 0
        : Math.round((this.snapshot.completed / this.snapshot.total) * 100);
    this.addSummaryMetric(752, 126, "COMPLETION", `${percent}%`);
    this.addSummaryMetric(
      986,
      126,
      "VERIFIED",
      `${this.snapshot.completed} / ${this.snapshot.total}`,
    );
    this.addSummaryMetric(
      1224,
      126,
      "MERIT",
      `${this.snapshot.pointsEarned} AP`,
    );
  }

  private addSummaryMetric(
    x: number,
    y: number,
    label: string,
    value: string,
  ): void {
    this.add.text(x, y, label, {
      color: "#8995a0",
      fontFamily: "Rajdhani",
      fontSize: "13px",
      fontStyle: "bold",
      letterSpacing: 1.8,
    });
    this.add.text(x, y + 24, value, {
      color: "#f7f9fb",
      fontFamily: "Rajdhani",
      fontSize: "31px",
      fontStyle: "bold",
      letterSpacing: 1,
    });
  }

  private createBackButton(): void {
    const x = 1640;
    const y = 112;
    const width = 208;
    const height = 58;
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
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
      surface
        .lineStyle(1, hovered ? 0x35c5f2 : 0xb9c2ca, 1)
        .strokePoints(
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
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0);
    bindButtonInteraction(hit, {
      draw,
      onActivate: () => this.leave(),
      onHover: () =>
        this.sound.play(AUDIO.select, {
          volume: scaledSfxVolume(0.14, this.audioSettings),
        }),
    });
    container.add([surface, label, hit]);
  }

  private renderCategoryRail(): void {
    this.categoryLayer?.destroy(true);
    const layer = this.add.container(0, 0);
    this.categoryLayer = layer;
    CATEGORIES.forEach((category, row) => {
      layer.add(this.createCategoryButton(category, 70, 286 + row * 154));
    });

    const totalTrack = this.add.graphics();
    totalTrack.fillStyle(0xc4cbd1, 1).fillRect(70, 790, 354, 8);
    const completion =
      this.snapshot.total === 0
        ? 0
        : this.snapshot.completed / this.snapshot.total;
    totalTrack.fillStyle(0x35c5f2, 1).fillRect(70, 790, 354 * completion, 8);
    layer.add(totalTrack);
    layer.add(
      this.add.text(70, 821, "DOSSIER COMPLETION", {
        color: "#7c8791",
        fontFamily: "Rajdhani",
        fontSize: "13px",
        fontStyle: "bold",
        letterSpacing: 2.2,
      }),
    );
    layer.add(
      this.add.text(
        70,
        848,
        `${this.snapshot.pointsEarned} / ${this.snapshot.totalPoints} ACHIEVEMENT POINTS`,
        {
          color: "#303a44",
          fontFamily: "Rajdhani",
          fontSize: "17px",
          fontStyle: "bold",
          letterSpacing: 1.1,
        },
      ),
    );
  }

  private createCategoryButton(
    category: CategoryDefinition,
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const selected = category.id === this.currentCategory;
    const entries = this.snapshot.entries.filter(
      (entry) => entry.definition.category === category.id,
    );
    const complete = entries.filter((entry) => entry.unlocked).length;
    const width = 354;
    const height = 126;
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface.fillStyle(selected ? 0x17212a : hovered ? 0xffffff : 0xf7f9fa, 1);
      surface.fillRect(0, 0, width, height);
      surface
        .lineStyle(1, selected ? 0x35c5f2 : hovered ? 0x8ecde1 : 0xc2c9cf, 1)
        .strokeRect(0.5, 0.5, width - 1, height - 1);
      surface
        .fillStyle(selected ? 0x35c5f2 : 0x9ba6af, 1)
        .fillRect(0, 0, 6, height);
    };
    draw(false);
    const index = this.add.text(25, 21, category.index, {
      color: selected ? "#35c5f2" : "#98a2ab",
      fontFamily: "Rajdhani",
      fontSize: "17px",
      fontStyle: "bold",
    });
    const title = this.add.text(74, 17, category.title, {
      color: selected ? "#f7f9fb" : "#27323c",
      fontFamily: "Rajdhani",
      fontSize: "27px",
      fontStyle: "bold",
      letterSpacing: 1.1,
    });
    const description = this.add.text(74, 55, category.description, {
      color: selected ? "#9eacb8" : "#7c8791",
      fontFamily: "Rajdhani",
      fontSize: "13px",
      fontStyle: "bold",
      letterSpacing: 1.4,
    });
    const count = this.add
      .text(width - 24, 91, `${complete} / ${entries.length}`, {
        color: selected ? "#35c5f2" : "#56636e",
        fontFamily: "Rajdhani",
        fontSize: "18px",
        fontStyle: "bold",
        letterSpacing: 1,
      })
      .setOrigin(1, 0.5);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerup", () => {
      if (!selected) {
        this.currentCategory = category.id;
        this.sound.play(AUDIO.confirm, {
          volume: scaledSfxVolume(0.2, this.audioSettings),
        });
        this.renderCategoryRail();
        this.renderAchievements();
      }
    });
    container.add([surface, index, title, description, count, hit]);
    return container;
  }

  private renderAchievements(): void {
    this.contentLayer?.destroy(true);
    const layer = this.add.container(0, 0);
    this.contentLayer = layer;
    const category = CATEGORIES.find(
      (entry) => entry.id === this.currentCategory,
    )!;
    const entries = this.snapshot.entries.filter(
      (entry) =>
        entry.definition.category === this.currentCategory &&
        (this.currentCategory !== "mastery" ||
          entry.definition.operatorId === this.currentOperator),
    );

    layer.add(
      this.add.text(
        496,
        258,
        this.currentCategory === "mastery"
          ? `${this.operatorName().toUpperCase()} RECORDS`
          : `${category.title} RECORDS`,
        {
          color: "#303a44",
          fontFamily: "Rajdhani",
          fontSize: "20px",
          fontStyle: "bold",
          letterSpacing: 2.1,
        },
      ),
    );
    layer.add(
      this.add
        .text(
          1848,
          260,
          `${entries.filter((entry) => entry.unlocked).length} VERIFIED`,
          {
            color: "#78848e",
            fontFamily: "Rajdhani",
            fontSize: "15px",
            fontStyle: "bold",
            letterSpacing: 1.7,
          },
        )
        .setOrigin(1, 0),
    );

    if (this.currentCategory === "mastery") {
      ACHIEVEMENT_OPERATORS.forEach((character, index) => {
        layer.add(
          this.createOperatorButton(
            character.id,
            character.name,
            496 + index * 121,
            292,
          ),
        );
      });
    }

    entries.forEach((entry, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      layer.add(
        this.createAchievementCard(
          entry,
          496 + column * 684,
          (this.currentCategory === "mastery" ? 374 : 294) + row * 190,
          index,
        ),
      );
    });
  }

  private createOperatorButton(
    id: CharacterId,
    name: string,
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const selected = id === this.currentOperator;
    const width = 113;
    const height = 56;
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(selected ? 0x17212a : hovered ? 0xffffff : 0xdde2e6, 1)
        .fillRect(0, 0, width, height)
        .lineStyle(1, selected || hovered ? 0x35c5f2 : 0xaeb8c0, 1)
        .strokeRect(0.5, 0.5, width - 1, height - 1)
        .fillStyle(selected ? 0x35c5f2 : 0x8d98a1, 1)
        .fillRect(0, height - 4, width, 4);
    };
    draw(false);
    const label = this.add
      .text(width / 2, height / 2 - 1, name.toUpperCase(), {
        color: selected ? "#f7f9fb" : "#34404a",
        fontFamily: "Rajdhani",
        fontSize: name.length > 8 ? "12px" : "14px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerup", () => {
      if (selected) return;
      this.currentOperator = id;
      this.sound.play(AUDIO.select, {
        volume: scaledSfxVolume(0.16, this.audioSettings),
      });
      this.renderAchievements();
    });
    container.add([surface, label, hit]);
    return container;
  }

  private operatorName(): string {
    return (
      CHARACTERS.find((character) => character.id === this.currentOperator)
        ?.name ?? "Operator"
    );
  }

  private createAchievementCard(
    entry: AchievementProgressEntry,
    x: number,
    y: number,
    index: number,
  ): Phaser.GameObjects.Container {
    const width = 650;
    // Compact enough for three rows above the footer bar.
    const height = 176;
    const unlocked = entry.unlocked;
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(
          unlocked
            ? hovered
              ? 0xffffff
              : 0xf8fafb
            : hovered
              ? 0xe5e9ec
              : 0xdde2e6,
          1,
        )
        .fillRect(0, 0, width, height);
      surface
        .lineStyle(1, unlocked ? 0x8db9c8 : 0xc0c7cd, 1)
        .strokeRect(0.5, 0.5, width - 1, height - 1);
      surface
        .fillStyle(unlocked ? 0x35c5f2 : 0x8b969f, 1)
        .fillRect(0, 0, 7, height);
      if (unlocked) {
        surface.fillStyle(0x202832, 1).fillRect(width - 116, 0, 116, 36);
      }
      surface.fillStyle(0xc4cbd1, 1).fillRect(116, 144, 494, 8);
      surface
        .fillStyle(unlocked ? 0x35c5f2 : 0x75828c, 1)
        .fillRect(
          116,
          144,
          494 * Math.min(1, entry.current / entry.definition.target),
          8,
        );
    };
    draw(false);

    const glyph = this.add.graphics();
    this.drawAchievementGlyph(glyph, unlocked);
    const recordIndex = this.add.text(
      117,
      20,
      `${this.categoryCode()}-${String(index + 1).padStart(2, "0")}`,
      {
        color: unlocked ? "#1c93b8" : "#7c8790",
        fontFamily: "Rajdhani",
        fontSize: "13px",
        fontStyle: "bold",
        letterSpacing: 1.7,
      },
    );
    const title = this.add.text(116, 44, entry.definition.title, {
      color: unlocked ? "#202a33" : "#56616b",
      fontFamily: "Rajdhani",
      fontSize: "27px",
      fontStyle: "bold",
      letterSpacing: 1.2,
    });
    const description = this.add.text(116, 80, entry.definition.description, {
      color: unlocked ? "#58636e" : "#7c858e",
      fontFamily: "Rajdhani",
      fontSize: "16px",
      lineSpacing: 2,
      wordWrap: { width: 490 },
    });
    const progressLabel = this.add.text(116, 118, "PROGRESS", {
      color: "#89949d",
      fontFamily: "Rajdhani",
      fontSize: "12px",
      fontStyle: "bold",
      letterSpacing: 1.5,
    });
    const progressValue = this.add
      .text(610, 117, `${entry.current} / ${entry.definition.target}`, {
        color: unlocked ? "#1c93b8" : "#5e6973",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "bold",
        letterSpacing: 1,
      })
      .setOrigin(1, 0);
    const points = this.add
      .text(width - 58, 18, `+${entry.definition.points} AP`, {
        color: unlocked ? "#f7f9fb" : "#78838c",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "bold",
        letterSpacing: 1,
      })
      .setOrigin(0.5, 0);
    const status = this.add
      .text(610, 164, unlocked ? "VERIFIED" : "IN PROGRESS", {
        color: unlocked ? "#1789a9" : "#747f88",
        fontFamily: "Rajdhani",
        fontSize: "12px",
        fontStyle: "bold",
        letterSpacing: 1.7,
      })
      .setOrigin(1, 0.5);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: false });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    container.add([
      surface,
      glyph,
      recordIndex,
      title,
      description,
      progressLabel,
      progressValue,
      points,
      status,
      hit,
    ]);
    return container;
  }

  private drawAchievementGlyph(
    graphics: Phaser.GameObjects.Graphics,
    unlocked: boolean,
  ): void {
    const color = unlocked ? 0x35c5f2 : 0x8d979f;
    graphics
      .fillStyle(unlocked ? 0x202832 : 0xcbd1d6, 1)
      .fillCircle(61, 80, 39);
    graphics.lineStyle(3, color, 1).strokeCircle(61, 80, 31);
    graphics.fillStyle(color, 1);
    if (unlocked) {
      graphics.fillTriangle(43, 113, 55, 100, 61, 120);
      graphics.fillTriangle(61, 120, 68, 100, 80, 113);
      graphics.lineStyle(5, color, 1);
      graphics.lineBetween(47, 79, 57, 89);
      graphics.lineBetween(57, 89, 76, 67);
    } else {
      graphics.lineStyle(4, color, 1).strokeRoundedRect(48, 75, 26, 23, 3);
      graphics.strokeCircle(61, 74, 10);
      graphics.fillCircle(61, 86, 3);
    }
  }

  private categoryCode(): string {
    switch (this.currentCategory) {
      case "combat":
        return "CBT";
      case "expedition":
        return "SRV";
      case "mastery":
        return "OPR";
    }
  }

  private leave(): void {
    if (this.leaving) {
      return;
    }
    this.leaving = true;
    gameAudio.playUi(this, "back");
    const transitionProfile = nextNikkeTransitionProfile();
    playHexWipeCover(
      this,
      () => {
        this.scene.launch("main-menu", {
          previousScene: "achievements",
          revealTransition: true,
          transitionProfile,
        });
      },
      transitionProfile,
    );
  }
}

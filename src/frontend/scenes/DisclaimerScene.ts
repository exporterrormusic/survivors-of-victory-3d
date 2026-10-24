import Phaser from "phaser";

import { GAME_AUDIO_KEYS, gameAudio } from "../audio/GameAudio";
import { captureDevelopmentPreview } from "../dev/capturePreview";
import {
  nextNikkeTransitionProfile,
  playHexWipeCover,
} from "../ui/transitions/HexWipeTransition";
import { preloadMainMenuAssets } from "./MainMenuScene";

const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;
const WALK_TEXTURE_KEY = "menu-disclaimer-kilo-walk";
const WALK_ANIMATION_KEY = "menu-disclaimer-kilo-walk-right";

const DISCLAIMER_LINES = [
  "This is an unofficial, fan-made game based on Goddess of Victory: NIKKE.",
  "It is not affiliated with, endorsed by, or sponsored by ShiftUp or any official partners.",
  "All trademarks and characters belong to their respective owners.",
] as const;

export class DisclaimerScene extends Phaser.Scene {
  private continueFrame?: Phaser.GameObjects.Graphics;
  private continueHovered = false;
  private continueLabel?: Phaser.GameObjects.Text;
  private content?: Phaser.GameObjects.Container;
  private leaving = false;
  private mainMenuAssetsReady = false;
  private pendingMainMenuLaunch?: () => void;
  private walker?: Phaser.GameObjects.Sprite;
  private walkerBaseY = 1015;

  public constructor() {
    super("disclaimer");
  }

  public preload(): void {
    this.load.spritesheet(
      WALK_TEXTURE_KEY,
      "assets/menus/disclaimer/kilo-walk.png",
      {
        frameHeight: 64,
        frameWidth: 51,
      },
    );
    this.load.audio(GAME_AUDIO_KEYS.ui.confirm, "assets/audio/ui/confirm.wav");
  }

  public create(): void {
    // ?preview=<scene> opens a menu directly; leaving a match returns with ?preview=main-menu.
    const preview = new URLSearchParams(window.location.search).get("preview");
    if (
      preview === "main-menu" ||
      preview === "achievements" ||
      preview === "records" ||
      preview === "settings" ||
      preview === "shop" ||
      preview === "character-select" ||
      preview === "stage-select"
    ) {
      this.scene.start(preview);
      return;
    }
    this.createWalkAnimation();
    this.content = this.add.container(0, 0).setDepth(0);
    this.renderHybridVariant(this.content);

    this.input.on("pointerdown", () => this.tryContinue());
    this.input.keyboard?.on("keydown-ENTER", () => this.tryContinue());
    this.input.keyboard?.on("keydown-SPACE", () => this.tryContinue());
    this.beginMainMenuWarmup();

    captureDevelopmentPreview(this, "disclaimer-hybrid");
  }

  public update(_time: number, delta: number): void {
    if (this.walker === undefined) {
      return;
    }
    this.walker.x += 150 * (delta / 1000);
    this.walker.y = this.walkerBaseY + Math.sin(this.time.now * 0.008) * 3;
    if (this.walker.x > SCREEN_WIDTH + 100) {
      this.walker.x = -100;
    }
  }

  private createWalkAnimation(): void {
    if (this.anims.exists(WALK_ANIMATION_KEY)) {
      return;
    }
    this.anims.create({
      frameRate: 6,
      frames: this.anims.generateFrameNumbers(WALK_TEXTURE_KEY, {
        end: 8,
        start: 6,
      }),
      key: WALK_ANIMATION_KEY,
      repeat: -1,
    });
  }

  private renderHybridVariant(root: Phaser.GameObjects.Container): void {
    root.add(
      this.add
        .rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, 0x11151b)
        .setOrigin(0),
    );

    const decoration = this.add.graphics();
    decoration.lineStyle(1, 0x5c6570, 0.12);
    for (let x = -360; x < SCREEN_WIDTH + 360; x += 180) {
      decoration.lineBetween(x, 0, x + 470, SCREEN_HEIGHT);
    }
    decoration.fillStyle(0x0b0e13, 0.9);
    decoration.fillRect(0, 0, SCREEN_WIDTH, 76);
    decoration.fillRect(0, SCREEN_HEIGHT - 54, SCREEN_WIDTH, 54);
    decoration.fillStyle(0x35c5f2, 1);
    decoration.fillRect(0, 74, 520, 3);
    decoration.fillRect(238, 375, 4, 330);
    decoration.lineStyle(1, 0x76808c, 0.5);
    decoration.lineBetween(238, 375, 292, 375);
    decoration.lineBetween(238, 705, 292, 705);
    root.add(decoration);

    root.add(
      this.add.text(52, 25, "SYSTEM NOTICE / LEGAL", {
        color: "#f0f4f8",
        fontFamily: "Rajdhani",
        fontSize: "27px",
        fontStyle: "bold",
        letterSpacing: 1.5,
      }),
    );
    root.add(
      this.add.text(1780, 25, "00", {
        color: "#8f98a4",
        fontFamily: "Rajdhani",
        fontSize: "27px",
        fontStyle: "bold",
      }),
    );

    root.add(
      this.add.text(303, 404, "DISCLAIMER", {
        color: "#f4f7fa",
        fontFamily: "Rajdhani",
        fontSize: "52px",
        fontStyle: "bold",
        letterSpacing: 2.2,
      }),
    );
    root.add(
      this.add.text(306, 466, "FAN PROJECT / NON-COMMERCIAL NOTICE", {
        color: "#35c5f2",
        fontFamily: "Rajdhani",
        fontSize: "18px",
        fontStyle: "bold",
        letterSpacing: 2.8,
      }),
    );

    DISCLAIMER_LINES.forEach((line, index) => {
      root.add(
        this.add.text(306, 542 + index * 54, line, {
          color: index === 2 ? "#98a1ad" : "#d4d9e0",
          fontFamily: "Pretendard",
          fontSize: "21px",
          fontStyle: "500",
        }),
      );
    });

    this.continueHovered = false;
    this.continueFrame = this.add.graphics();
    root.add(this.continueFrame);

    this.continueLabel = this.add
      .text(1580, 685, "", {
        color: "#7d8691",
        fontFamily: "Rajdhani",
        fontSize: "19px",
        fontStyle: "bold",
        letterSpacing: 1.2,
      })
      .setOrigin(0.5);
    root.add(this.continueLabel);
    const promptHit = this.add
      .rectangle(1418, 658, 324, 54, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    promptHit.on("pointerover", () => {
      this.continueHovered = true;
      this.updateContinuePrompt();
    });
    promptHit.on("pointerout", () => {
      this.continueHovered = false;
      this.updateContinuePrompt();
    });
    root.add(promptHit);

    root.add(
      this.add.text(52, 1023, "SOV // CLIENT INITIALIZATION", {
        color: "#69727d",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 2,
      }),
    );

    this.updateContinuePrompt();
  }

  private updateContinuePrompt(): void {
    if (this.continueLabel === undefined || this.continueFrame === undefined) {
      return;
    }
    this.continueFrame.clear();
    this.continueFrame.fillStyle(
      this.continueHovered ? 0x35c5f2 : 0x252b34,
      this.continueHovered ? 1 : 0.92,
    );
    this.continueFrame.fillRect(1418, 658, 324, 54);
    if (!this.continueHovered) {
      this.continueFrame.fillStyle(0x35c5f2, 1);
      this.continueFrame.fillRect(1418, 658, 5, 54);
    }
    this.continueFrame.lineStyle(
      1,
      this.continueHovered ? 0x168db3 : 0x59636f,
      0.8,
    );
    this.continueFrame.strokeRect(1418.5, 658.5, 323, 53);
    this.continueLabel.setText("CLICK ANYWHERE TO CONTINUE");
    this.continueLabel.setColor(this.continueHovered ? "#252b34" : "#c8cae0");
  }

  private tryContinue(): void {
    if (this.leaving) {
      return;
    }
    this.leaving = true;
    gameAudio.playUi(this, "confirm");
    const transitionProfile = nextNikkeTransitionProfile();
    playHexWipeCover(
      this,
      () => {
        const launch = (): void => {
          this.scene.launch("main-menu", {
            previousScene: "disclaimer",
            revealTransition: true,
            transitionProfile,
          });
        };
        if (this.mainMenuAssetsReady) {
          launch();
        } else {
          this.pendingMainMenuLaunch = launch;
        }
      },
      transitionProfile,
    );
  }

  private beginMainMenuWarmup(): void {
    preloadMainMenuAssets(this);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.mainMenuAssetsReady = true;
      const launch = this.pendingMainMenuLaunch;
      this.pendingMainMenuLaunch = undefined;
      launch?.();
    });
    this.load.start();
  }
}

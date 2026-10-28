import { cores } from "../ui/cores";
import { GAME_VERSION, VERSION_LABEL } from "../../version";
import Phaser from "phaser";

import { gameAudio, preloadLobbyAudio } from "../audio/GameAudio";
import { captureDevelopmentPreview } from "../dev/capturePreview";
import { loadAchievementSnapshot } from "../profile/AchievementProgress";
import {
  awardPristineCores,
  loadRosterState,
  setAllContentUnlocked,
} from "../profile/CharacterRoster";
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
const BLIND_WIDTH = 540;
const BLIND_SPEED = 100;
const BLIND_ANGLE_OFFSET = HEIGHT * Math.tan(Phaser.Math.DegToRad(15));

const BACKGROUND_FILES = [
  "ark.jpg",
  "battlefield1.jpg",
  "bunker-interior.jpg",
  "eden.jpg",
  "forest.jpg",
  "hg.jpg",
  "kingdom.jpg",
  "mushroom.jpg",
  "rapturefield1.jpg",
  "rapturefield2.jpg",
  "snow-day.jpg",
  "snow-night.jpg",
  "space.jpg",
] as const;

const BACKGROUND_KEYS = BACKGROUND_FILES.map(
  (_file, index) => `main-menu-slide-${index}`,
);

const ASSETS = {
  confirm: "main-menu-confirm",
  logo: "main-menu-logo",
  logoOptimized: "main-menu-logo-optimized",
  select: "main-menu-select",
} as const;

export function preloadMainMenuAssets(scene: Phaser.Scene): void {
  BACKGROUND_FILES.forEach((file, index) => {
    scene.load.image(
      BACKGROUND_KEYS[index]!,
      `assets/menus/main/slides/${file}`,
    );
  });
  scene.load.image(ASSETS.logo, "assets/menus/main/logo.png");
  scene.load.audio(ASSETS.select, "assets/audio/ui/select.wav");
  scene.load.audio(ASSETS.confirm, "assets/audio/ui/confirm.wav");
  preloadLobbyAudio(scene);
}

// One unread dot per release: bumping GAME_VERSION shows the dot again.
const NOTICE_STORAGE_KEY = `nikke-moba.notice.v${GAME_VERSION}`;

interface PatchRelease {
  readonly sections: readonly {
    readonly heading: string;
    readonly items: readonly string[];
  }[];
  readonly title: string;
  readonly version: string;
}

// Newest first. The first entry's version must equal GAME_VERSION (src/version.ts).
const PATCH_RELEASES: readonly PatchRelease[] = [
  {
    version: "0.1",
    title: "CLOSED ALPHA",
    sections: [
      {
        heading: "WELCOME",
        items: [
          "Thanks for testing this early build. Please report bugs and how rounds felt, with the version from the bottom-left corner.",
        ],
      },
      {
        heading: "MODES",
        items: [
          "WAVE: survive 10 minutes, then defeat Obelisk for a Rapture Core. ENDLESS: the horde never stops.",
          "Every 60 seconds the lift brings a health crate and a squad of mass-produced NIKKEs to fight beside you.",
        ],
      },
      {
        heading: "NIKKES",
        items: [
          "Playable: Snow White, plus Scarlet and Rapunzel for 3 Rapture Cores each. Others are coming soon.",
          "Talents are chosen as you level up and reset every round.",
        ],
      },
      {
        heading: "PROGRESS",
        items: [
          "Cores, unlocks, skins, records and settings save on this device.",
          "Settings > DATA exports a backup file and imports it, e.g. to move from the browser to the download.",
        ],
      },
    ],
  },
] as const;

type ButtonStyle = "cyan" | "danger" | "dark" | "utility" | "white";
type MenuIcon =
  | "achievement"
  | "leaderboard"
  | "notice"
  | "play"
  | "quit"
  | "settings"
  | "shop";

interface MenuButtonOptions {
  readonly height: number;
  readonly icon: MenuIcon;
  readonly onClick?: () => void;
  readonly style: ButtonStyle;
  readonly subtitle?: string;
  readonly title: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

interface MovingBlind {
  readonly image: Phaser.GameObjects.Image;
  readonly maskShape: Phaser.GameObjects.Graphics;
  x: number;
}

interface MainMenuSceneData {
  readonly previousScene?: string;
  readonly revealTransition?: boolean;
  readonly transitionProfile?: HexWipeProfile;
}

export class MainMenuScene extends Phaser.Scene {
  private audioSettings: AudioSettings = loadAudioSettings();
  private readonly blinds: MovingBlind[] = [];
  private nextBlindTexture = 0;
  private coreValueText?: Phaser.GameObjects.Text;
  private devMenuLayer?: Phaser.GameObjects.Container;
  private devMenuStatusText?: Phaser.GameObjects.Text;
  private noticeDetailLayer?: Phaser.GameObjects.Container;
  private noticeLayer?: Phaser.GameObjects.Container;
  private noticeUnreadDot?: Phaser.GameObjects.Arc;
  private previousScene?: string;
  private revealTransition = false;
  private transitionProfile?: HexWipeProfile;

  public constructor() {
    super("main-menu");
  }

  public preload(): void {
    preloadMainMenuAssets(this);
  }

  public init(data: MainMenuSceneData = {}): void {
    this.coreValueText = undefined;
    this.devMenuLayer = undefined;
    this.devMenuStatusText = undefined;
    this.noticeDetailLayer = undefined;
    this.noticeLayer = undefined;
    this.noticeUnreadDot = undefined;
    this.previousScene = data.previousScene;
    this.revealTransition = data.revealTransition ?? false;
    this.transitionProfile = data.transitionProfile;
  }

  public create(): void {
    this.audioSettings = loadAudioSettings();
    this.blinds.length = 0;
    this.nextBlindTexture = 0;
    this.createBackground();
    this.createChrome();
    this.createLogo();
    this.createNavigation();
    this.createPrimaryActions();
    this.input.keyboard?.on("keydown-F2", () => this.toggleDevMenu());
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.devMenuLayer !== undefined) {
        this.closeDevMenu();
        return;
      }
      this.closeNotice();
    });
    gameAudio.stopEnvironmentAmbience();
    gameAudio.playLobby(this);

    if (this.revealTransition) {
      playHexWipeReveal(this, this.transitionProfile ?? "LOBBY");
      if (this.previousScene !== undefined) {
        this.scene.stop(this.previousScene);
      }
    } else {
      this.cameras.main.fadeIn(360, 0, 0, 0);
    }
    captureDevelopmentPreview(this, "main-menu-hybrid");
  }

  public update(_time: number, delta: number): void {
    const travel = (BLIND_SPEED * delta) / 1000;
    this.blinds.forEach((blind) => {
      blind.x -= travel;
      if (blind.x + BLIND_WIDTH + BLIND_ANGLE_OFFSET < 0) {
        const rightmost = Math.max(...this.blinds.map((entry) => entry.x));
        blind.x = rightmost + BLIND_WIDTH;
        const textureKey =
          BACKGROUND_KEYS[this.nextBlindTexture % BACKGROUND_KEYS.length]!;
        this.nextBlindTexture += 1;
        blind.image.setTexture(textureKey);
        this.fitImageToBlind(blind.image, textureKey);
      }
      this.positionBlindImage(blind);
      this.drawBlindMask(blind);
    });
  }

  private createBackground(): void {
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x091016).setOrigin(0);
    const blindCount = 8;
    const startX = -BLIND_WIDTH * 2;
    for (let index = 0; index < blindCount; index += 1) {
      const textureIndex = index % BACKGROUND_KEYS.length;
      const textureKey = BACKGROUND_KEYS[textureIndex]!;
      const image = this.add.image(0, HEIGHT / 2, textureKey).setTint(0xa5c1c8);

      const maskShape = this.add.graphics();
      this.children.remove(maskShape);
      image
        .enableFilters()
        .filters!.external.addMask(maskShape, false, this.cameras.main);
      const blind = { image, maskShape, x: startX + index * BLIND_WIDTH };
      this.blinds.push(blind);
      this.fitImageToBlind(image, textureKey);
      this.positionBlindImage(blind);
      this.drawBlindMask(blind);
    }
    this.nextBlindTexture = blindCount;

    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x081018, 0.55).setOrigin(0);
  }

  private drawBlindMask(blind: MovingBlind): void {
    blind.maskShape.clear();
    blind.maskShape.fillStyle(0xffffff, 1);
    blind.maskShape.fillPoints(
      [
        new Phaser.Math.Vector2(blind.x, 0),
        new Phaser.Math.Vector2(blind.x + BLIND_WIDTH, 0),
        new Phaser.Math.Vector2(
          blind.x + BLIND_WIDTH + BLIND_ANGLE_OFFSET,
          HEIGHT,
        ),
        new Phaser.Math.Vector2(blind.x + BLIND_ANGLE_OFFSET, HEIGHT),
      ],
      true,
    );
  }

  private fitImageToBlind(
    image: Phaser.GameObjects.Image,
    textureKey: string,
  ): void {
    const source = this.textures
      .get(textureKey)
      .getSourceImage() as HTMLImageElement;
    const effectiveWidth = BLIND_WIDTH + Math.abs(BLIND_ANGLE_OFFSET);
    const scale =
      Math.max(effectiveWidth / source.width, HEIGHT / source.height) * 1.02;
    image.setScale(scale);
  }

  private positionBlindImage(blind: MovingBlind): void {
    const effectiveWidth = BLIND_WIDTH + BLIND_ANGLE_OFFSET;
    blind.image.setPosition(blind.x + effectiveWidth / 2, HEIGHT / 2);
  }

  private createChrome(): void {
    const chrome = this.add.graphics();
    chrome.fillStyle(0x090d12, 0.94);
    chrome.fillRect(0, 0, WIDTH, 76);
    chrome.fillRect(0, HEIGHT - 48, WIDTH, 48);
    chrome.fillStyle(0x35c5f2, 1);
    chrome.fillRect(0, 74, 515, 3);
    chrome.fillStyle(0xaeb7c1, 0.35);
    chrome.fillRect(515, 75, WIDTH - 515, 1);

    this.add.text(52, 25, "ARK SYSTEM / LOBBY", {
      color: "#f2f5f7",
      fontFamily: "Rajdhani",
      fontSize: "26px",
      fontStyle: "bold",
      letterSpacing: 1.8,
    });
    this.add.text(1774, 26, "01", {
      color: "#9aa4af",
      fontFamily: "Rajdhani",
      fontSize: "25px",
      fontStyle: "bold",
    });
    this.add.text(52, 1038, VERSION_LABEL, {
      color: "#8a949f",
      fontFamily: "Rajdhani",
      fontSize: "15px",
      fontStyle: "bold",
      letterSpacing: 2,
    });
    this.add.text(1714, 1038, "ONLINE // LOCAL", {
      color: "#35c5f2",
      fontFamily: "Rajdhani",
      fontSize: "15px",
      fontStyle: "bold",
      letterSpacing: 1.5,
    });
  }

  private createLogo(): void {
    const logoX = 62;
    const logoWidth = 650;
    const source = this.textures
      .get(ASSETS.logo)
      .getSourceImage() as HTMLImageElement;
    const logoHeight = Math.round((logoWidth * source.height) / source.width);
    const logoCenter = logoX + logoWidth / 2;
    let logoTexture: string = ASSETS.logo;

    if (!this.textures.exists(ASSETS.logoOptimized)) {
      const optimized = this.textures.createCanvas(
        ASSETS.logoOptimized,
        logoWidth,
        logoHeight,
      );
      if (optimized !== null) {
        const context = optimized.getContext();
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.clearRect(0, 0, logoWidth, logoHeight);
        context.drawImage(source, 0, 0, logoWidth, logoHeight);
        optimized.refresh();
      }
    }
    if (this.textures.exists(ASSETS.logoOptimized)) {
      logoTexture = ASSETS.logoOptimized;
    }

    this.add.image(logoX, 100, logoTexture).setOrigin(0);

    const greebles = this.add.graphics();
    const greebleStart = logoCenter - 220;
    greebles.fillStyle(0x35c5f2, 1);
    greebles.fillRect(greebleStart, 321, 122, 4);
    greebles.fillStyle(0xe8edf1, 0.82);
    const widths = [2, 5, 2, 3, 7, 2, 4, 2, 6, 3, 2, 8, 2, 4, 3, 6, 2, 5];
    let cursor = greebleStart + 142;
    widths.forEach((barWidth, index) => {
      greebles.fillRect(cursor, 317, barWidth, 12);
      cursor += barWidth + (index % 3 === 0 ? 4 : 3);
    });
    greebles.fillStyle(0x89939e, 0.7);
    greebles.fillRect(cursor + 10, 321, 154, 1);

    this.add
      .text(logoCenter, 341, "A NIKKE FAN PROJECT // EXPORT / ERROR MUSIC", {
        color: "#aeb7c1",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 1.8,
      })
      .setOrigin(0.5, 0);
  }

  private createNavigation(): void {
    const achievementSnapshot = loadAchievementSnapshot();
    const entries: readonly Omit<
      MenuButtonOptions,
      "height" | "style" | "width" | "x" | "y"
    >[] = [
      {
        icon: "shop",
        onClick: () => this.openShop(),
        subtitle: "PRISTINE CORE EXCHANGE",
        title: "SHOP",
      },
      {
        icon: "leaderboard",
        onClick: () => this.openRecords(),
        subtitle: "LOCAL PERSONAL BESTS",
        title: "RECORDS",
      },
      {
        icon: "achievement",
        onClick: () => this.openAchievements(),
        subtitle: `${achievementSnapshot.completed} / ${achievementSnapshot.total} VERIFIED`,
        title: "ACHIEVEMENTS",
      },
      {
        icon: "settings",
        onClick: () => this.openSettings(),
        title: "SETTINGS",
      },
    ];

    entries.forEach((entry, index) => {
      this.createMenuButton({
        ...entry,
        height: 96,
        style: index === 0 ? "cyan" : "dark",
        width: 352,
        x: index % 2 === 0 ? 72 : 90,
        y: 447 + index * 126,
      });
    });
  }

  private createPrimaryActions(): void {
    this.createMenuButton({
      height: 150,
      icon: "play",
      onClick: () => this.beginPlay(),
      style: "white",
      subtitle: "SELECT NIKKE & DEPLOY",
      title: "PLAY",
      width: 480,
      x: 1368,
      y: 480,
    });
    this.createMenuButton({
      height: 58,
      icon: "quit",
      style: "danger",
      title: "QUIT",
      width: 226,
      x: 1606,
      y: 650,
    });
    const noticeButton = this.createMenuButton({
      height: 46,
      icon: "notice",
      onClick: () => this.openNotice(),
      style: "utility",
      title: "NOTICE",
      width: 168,
      x: 1494,
      y: 98,
    });
    if (this.isNoticeUnread()) {
      this.noticeUnreadDot = this.add
        .circle(157, 7, 7, 0xe8392e)
        .setStrokeStyle(3, 0xffaaa5, 0.72);
      noticeButton.add(this.noticeUnreadDot);
    }
    this.createCoreReadout();
  }

  private isNoticeUnread(): boolean {
    try {
      return window.localStorage.getItem(NOTICE_STORAGE_KEY) !== "read";
    } catch {
      return true;
    }
  }

  private markNoticeRead(): void {
    try {
      window.localStorage.setItem(NOTICE_STORAGE_KEY, "read");
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
    this.noticeUnreadDot?.destroy();
    this.noticeUnreadDot = undefined;
  }

  private openNotice(): void {
    if (this.noticeLayer !== undefined) {
      return;
    }
    this.markNoticeRead();

    const panelX = 380;
    const panelY = 120;
    const panelWidth = 1160;
    const panelHeight = 840;
    const layer = this.add.container(0, 0).setDepth(2000).setAlpha(0);
    this.noticeLayer = layer;

    const scrim = this.add
      .rectangle(0, 0, WIDTH, HEIGHT, 0x03070a, 0.82)
      .setOrigin(0)
      .setInteractive({ useHandCursor: false });
    scrim.on("pointerup", () => this.closeNotice());

    const panelBlocker = this.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, 0xffffff, 0.001)
      .setOrigin(0)
      .setInteractive();
    const chrome = this.add.graphics();
    chrome
      .fillStyle(0x000000, 0.35)
      .fillRect(panelX + 16, panelY + 18, panelWidth, panelHeight);
    chrome
      .fillStyle(0xf1f3f5, 1)
      .fillRect(panelX, panelY, panelWidth, panelHeight);
    chrome
      .lineStyle(1, 0xb8c0c7, 1)
      .strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);
    chrome.fillStyle(0x202832, 1).fillRect(panelX, panelY, panelWidth, 142);
    chrome
      .fillStyle(0x35c5f2, 1)
      .fillRect(panelX, panelY + 138, panelWidth * 0.72, 4);
    chrome
      .fillStyle(0xe8392e, 1)
      .fillRect(panelX + panelWidth * 0.72, panelY + 138, panelWidth * 0.28, 4);
    chrome.fillStyle(0xdde2e6, 1).fillRect(panelX + 286, panelY + 176, 1, 570);
    chrome.fillStyle(0xc7ced4, 1).fillRect(panelX + 318, panelY + 746, 790, 1);

    const eyebrow = this.add.text(
      panelX + 42,
      panelY + 28,
      "ARK SYSTEM BULLETIN // RELEASE UPDATE",
      {
        color: "#8e9aa7",
        fontFamily: "Rajdhani",
        fontSize: "16px",
        fontStyle: "bold",
        letterSpacing: 2.2,
      },
    );
    const heading = this.add.text(panelX + 40, panelY + 54, "RELEASE NOTES", {
      color: "#f7f9fb",
      fontFamily: "Rajdhani",
      fontSize: "52px",
      fontStyle: "bold",
      letterSpacing: 3,
    });
    const archive = this.add
      .text(
        panelX + panelWidth - 42,
        panelY + 89,
        `PATCH ARCHIVE // ${String(PATCH_RELEASES.length).padStart(2, "0")} ${PATCH_RELEASES.length === 1 ? "ENTRY" : "ENTRIES"}`,
        {
          color: "#aeb7c1",
          fontFamily: "Rajdhani",
          fontSize: "16px",
          fontStyle: "bold",
          letterSpacing: 1.8,
        },
      )
      .setOrigin(1, 0.5);
    const railLabel = this.add.text(
      panelX + 42,
      panelY + 168,
      "RELEASE INDEX",
      {
        color: "#77828d",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 1.7,
      },
    );
    const footer = this.add
      .text(
        panelX + 42,
        panelY + panelHeight - 43,
        `VERSION ${GAME_VERSION} // ${PATCH_RELEASES[0]!.title}`,
        {
          color: "#8b959e",
          fontFamily: "Rajdhani",
          fontSize: "14px",
          fontStyle: "bold",
          letterSpacing: 1.5,
        },
      )
      .setOrigin(0, 0.5);

    layer.add([
      scrim,
      chrome,
      panelBlocker,
      eyebrow,
      heading,
      archive,
      railLabel,
      footer,
    ]);
    layer.add(
      this.createNoticeCloseButton(
        panelX + panelWidth - 216,
        panelY + panelHeight - 70,
      ),
    );
    this.renderNoticeRelease(0, panelX, panelY);

    this.tweens.add({
      targets: layer,
      alpha: 1,
      duration: 180,
      ease: "Quad.easeOut",
    });
  }

  private renderNoticeRelease(
    index: number,
    panelX: number,
    panelY: number,
  ): void {
    this.noticeDetailLayer?.destroy(true);
    const detailLayer = this.add.container(0, 0);
    this.noticeDetailLayer = detailLayer;
    this.noticeLayer?.add(detailLayer);

    PATCH_RELEASES.forEach((release, releaseIndex) => {
      detailLayer.add(
        this.createNoticeReleaseButton(
          panelX + 40,
          panelY + 205 + releaseIndex * 108,
          release,
          releaseIndex === index,
          () => this.renderNoticeRelease(releaseIndex, panelX, panelY),
        ),
      );
    });

    const release = PATCH_RELEASES[index]!;
    const contentX = panelX + 320;
    let contentY = panelY + 177;
    detailLayer.add(
      this.add.text(contentX, contentY, release.version.toUpperCase(), {
        color: "#1f8fe0",
        fontFamily: "Rajdhani",
        fontSize: "20px",
        fontStyle: "bold",
        letterSpacing: 2,
      }),
    );
    contentY += 27;
    detailLayer.add(
      this.add.text(contentX, contentY, release.title, {
        color: "#202832",
        fontFamily: "Rajdhani",
        fontSize: "34px",
        fontStyle: "bold",
        letterSpacing: 1.4,
      }),
    );
    contentY += 69;

    release.sections.forEach((section) => {
      detailLayer.add(
        this.add.text(contentX, contentY, section.heading, {
          color: "#52616d",
          fontFamily: "Rajdhani",
          fontSize: "16px",
          fontStyle: "bold",
          letterSpacing: 1.7,
        }),
      );
      contentY += 29;
      section.items.forEach((item) => {
        const bullet = this.add.text(contentX + 26, contentY, item, {
          color: "#303943",
          fontFamily: "Rajdhani",
          fontSize: "16px",
          lineSpacing: 2,
          wordWrap: { width: 720 },
        });
        const marker = this.add
          .rectangle(contentX + 5, contentY + 10, 7, 7, 0x35c5f2)
          .setRotation(Math.PI / 4);
        detailLayer.add([marker, bullet]);
        contentY += bullet.height + 8;
      });
      contentY += 9;
    });
  }

  private createNoticeReleaseButton(
    x: number,
    y: number,
    release: PatchRelease,
    selected: boolean,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const width = 214;
    const height = 88;
    const button = this.add.container(x, y);
    const surface = this.add.graphics();
    const version = this.add.text(24, 17, release.version.toUpperCase(), {
      color: selected ? "#ffffff" : "#27323c",
      fontFamily: "Rajdhani",
      fontSize: "24px",
      fontStyle: "bold",
      letterSpacing: 1.2,
    });
    const title = this.add
      .text(24, 52, release.title, {
        color: selected ? "#d9f5ff" : "#7a8691",
        fontFamily: "Rajdhani",
        fontSize: "12px",
        fontStyle: "bold",
        letterSpacing: 1,
      })
      .setOrigin(0, 0.5);
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(selected ? 0x238eb8 : hovered ? 0xffffff : 0xe3e7ea, 1)
        .fillRect(0, 0, width, height);
      surface
        .lineStyle(1, selected ? 0x168db3 : hovered ? 0x35c5f2 : 0xc2c9cf, 1)
        .strokeRect(0.5, 0.5, width - 1, height - 1);
      surface
        .fillStyle(selected ? 0xffffff : 0x35c5f2, 1)
        .fillRect(0, 0, 5, height);
    };
    draw(false);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerup", () => {
      if (!selected) {
        this.sound.play(ASSETS.select, {
          volume: scaledSfxVolume(0.14, this.audioSettings),
        });
        onClick();
      }
    });
    button.add([surface, version, title, hit]);
    return button;
  }

  private createNoticeCloseButton(
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const width = 176;
    const height = 48;
    const button = this.add.container(x, y);
    const surface = this.add.graphics();
    const label = this.add
      .text(width / 2, height / 2, "CLOSE", {
        color: "#f7f9fb",
        fontFamily: "Rajdhani",
        fontSize: "19px",
        fontStyle: "bold",
        letterSpacing: 1.5,
      })
      .setOrigin(0.5);
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(hovered ? 0x35c5f2 : 0x202832, 1)
        .fillRect(0, 0, width, height);
      surface
        .fillStyle(hovered ? 0xffffff : 0x35c5f2, 1)
        .fillRect(0, height - 4, width, 4);
    };
    draw(false);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerup", () => this.closeNotice());
    button.add([surface, label, hit]);
    return button;
  }

  private closeNotice(): void {
    const layer = this.noticeLayer;
    if (layer === undefined) {
      return;
    }
    this.noticeLayer = undefined;
    this.noticeDetailLayer = undefined;
    this.sound.play(ASSETS.confirm, {
      volume: scaledSfxVolume(0.18, this.audioSettings),
    });
    this.tweens.add({
      targets: layer,
      alpha: 0,
      duration: 130,
      ease: "Quad.easeIn",
      onComplete: () => layer.destroy(true),
    });
  }

  private createCoreReadout(): void {
    const panel = this.add.graphics();
    panel.fillStyle(0x10161d, 0.94);
    panel.fillRect(1680, 98, 162, 46);
    panel.lineStyle(1, 0x5d6873, 0.9);
    panel.strokeRect(1680.5, 98.5, 161, 45);
    panel.fillStyle(0xe8392e, 1);
    panel.fillCircle(1705, 121, 8);
    panel.lineStyle(1, 0xff8179, 0.9);
    panel.strokeCircle(1705, 121, 12);
    this.coreValueText = this.add.text(
      1726,
      107,
      `${loadRosterState().pristineCores}`,
      {
        color: "#f2f5f7",
        fontFamily: "Rajdhani",
        fontSize: "24px",
        fontStyle: "bold",
      },
    );
    this.add.text(1765, 112, "CORES", {
      color: "#8f99a5",
      fontFamily: "Rajdhani",
      fontSize: "13px",
      fontStyle: "bold",
      letterSpacing: 1.2,
    });
  }

  private toggleDevMenu(): void {
    if (this.devMenuLayer !== undefined) {
      this.closeDevMenu();
      return;
    }
    this.openDevMenu();
  }

  private openDevMenu(): void {
    this.closeNotice();

    const panelX = 650;
    const panelY = 250;
    const panelWidth = 620;
    const panelHeight = 580;
    const layer = this.add.container(0, 0).setDepth(3000).setAlpha(0);
    this.devMenuLayer = layer;

    const scrim = this.add
      .rectangle(0, 0, WIDTH, HEIGHT, 0x02060a, 0.78)
      .setOrigin(0)
      .setInteractive({ useHandCursor: false });
    scrim.on("pointerup", () => this.closeDevMenu());

    const blocker = this.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, 0xffffff, 0.001)
      .setOrigin(0)
      .setInteractive();
    const chrome = this.add.graphics();
    chrome
      .fillStyle(0x0e151d, 1)
      .fillRect(panelX, panelY, panelWidth, panelHeight);
    chrome
      .lineStyle(2, 0x35c5f2, 1)
      .strokeRect(panelX + 1, panelY + 1, panelWidth - 2, panelHeight - 2);
    chrome.fillStyle(0x202832, 1).fillRect(panelX, panelY, panelWidth, 118);
    chrome.fillStyle(0x35c5f2, 1).fillRect(panelX, panelY + 114, panelWidth, 4);
    chrome
      .fillStyle(0xe8392e, 1)
      .fillRect(panelX + panelWidth - 154, panelY, 154, 6);

    const eyebrow = this.add.text(
      panelX + 36,
      panelY + 24,
      "LOCAL DEVELOPMENT TOOLS // F2",
      {
        color: "#8e9aa7",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 2,
      },
    );
    const heading = this.add.text(panelX + 34, panelY + 48, "DEV MENU", {
      color: "#f7f9fb",
      fontFamily: "Rajdhani",
      fontSize: "43px",
      fontStyle: "bold",
      letterSpacing: 2.4,
    });
    const closeHint = this.add
      .text(panelX + panelWidth - 34, panelY + 72, "F2 / ESC  CLOSE", {
        color: "#aeb7c1",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "bold",
        letterSpacing: 1.4,
      })
      .setOrigin(1, 0.5);
    const warning = this.add.text(
      panelX + 36,
      panelY + 140,
      "Changes are saved to this local profile immediately.",
      {
        color: "#93a0ac",
        fontFamily: "Rajdhani",
        fontSize: "16px",
      },
    );
    this.devMenuStatusText = this.add.text(
      panelX + 36,
      panelY + panelHeight - 54,
      "",
      {
        color: "#35c5f2",
        fontFamily: "Rajdhani",
        fontSize: "16px",
        fontStyle: "bold",
        letterSpacing: 1.3,
      },
    );

    layer.add([
      scrim,
      chrome,
      blocker,
      eyebrow,
      heading,
      closeHint,
      warning,
      this.devMenuStatusText,
    ]);
    layer.add(
      this.createDevMenuButton(
        panelX + 36,
        panelY + 196,
        panelWidth - 72,
        "UNLOCK EVERYTHING",
        "Unlock all operators and supply items",
        () => {
          setAllContentUnlocked(true);
          this.refreshDevMenuState("ALL CONTENT UNLOCKED");
        },
      ),
    );
    layer.add(
      this.createDevMenuButton(
        panelX + 36,
        panelY + 302,
        panelWidth - 72,
        "LOCK EVERYTHING",
        "Restore starter operator and med kit only",
        () => {
          setAllContentUnlocked(false);
          this.refreshDevMenuState("CONTENT LOCKS RESTORED");
        },
        true,
      ),
    );
    layer.add(
      this.createDevMenuButton(
        panelX + 36,
        panelY + 408,
        panelWidth - 72,
        "ADD 10 CORES",
        "Increase Pristine Rapture Core balance by 10",
        () => {
          awardPristineCores(10);
          this.refreshDevMenuState("10 CORES ADDED");
        },
      ),
    );
    this.refreshDevMenuState();

    this.tweens.add({
      targets: layer,
      alpha: 1,
      duration: 140,
      ease: "Quad.easeOut",
    });
  }

  private createDevMenuButton(
    x: number,
    y: number,
    width: number,
    titleText: string,
    subtitleText: string,
    onClick: () => void,
    danger = false,
  ): Phaser.GameObjects.Container {
    const height = 86;
    const button = this.add.container(x, y);
    const surface = this.add.graphics();
    const title = this.add.text(24, 15, titleText, {
      color: "#f7f9fb",
      fontFamily: "Rajdhani",
      fontSize: "24px",
      fontStyle: "bold",
      letterSpacing: 1.4,
    });
    const subtitle = this.add.text(24, 49, subtitleText.toUpperCase(), {
      color: "#aeb7c1",
      fontFamily: "Rajdhani",
      fontSize: "13px",
      fontStyle: "bold",
      letterSpacing: 1.1,
    });
    const draw = (hovered: boolean): void => {
      const accent = danger ? 0xe8392e : 0x35c5f2;
      surface.clear();
      surface
        .fillStyle(hovered ? 0x27333e : 0x19222b, 1)
        .fillRect(0, 0, width, height);
      surface
        .lineStyle(1, hovered ? accent : 0x52606d, 1)
        .strokeRect(0.5, 0.5, width - 1, height - 1);
      surface.fillStyle(accent, 1).fillRect(0, 0, 6, height);
    };
    draw(false);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerup", () => {
      this.sound.play(ASSETS.confirm, {
        volume: scaledSfxVolume(0.18, this.audioSettings),
      });
      onClick();
    });
    button.add([surface, title, subtitle, hit]);
    return button;
  }

  private refreshDevMenuState(message?: string): void {
    const state = loadRosterState();
    this.coreValueText?.setText(`${state.pristineCores}`);
    this.devMenuStatusText?.setText(
      message === undefined
        ? `PROFILE BALANCE // ${cores(state.pristineCores)}`
        : `${message} // ${cores(state.pristineCores)}`,
    );
  }

  private closeDevMenu(): void {
    const layer = this.devMenuLayer;
    if (layer === undefined) {
      return;
    }
    this.devMenuLayer = undefined;
    this.devMenuStatusText = undefined;
    this.tweens.add({
      targets: layer,
      alpha: 0,
      duration: 100,
      ease: "Quad.easeIn",
      onComplete: () => layer.destroy(true),
    });
  }

  private createMenuButton(
    options: MenuButtonOptions,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(options.x, options.y);
    const surface = this.add.graphics();
    const hitArea = this.add
      .rectangle(0, 0, options.width, options.height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    const icon = this.add.graphics();
    // The compact cyan New Game action needs a tighter content group. The
    // large white no-save variant uses the standard inset so its badge stays
    // inside the card.
    const iconOffset =
      options.title === "NEW GAME" && options.style !== "white" ? -36 : 0;
    icon.x = iconOffset;
    const titleSize =
      options.style === "white"
        ? 48
        : options.style === "utility"
          ? 20
          : options.style === "danger"
            ? 22
            : options.title === "SHOP"
              ? 28
              : 26;
    const titleY =
      options.subtitle === undefined
        ? options.height / 2
        : options.style === "white"
          ? 31
          : 24;
    const titleX =
      options.style === "white"
        ? 106
        : options.style === "dark"
          ? 68
          : options.subtitle === undefined
            ? 58
            : 68;
    const title = this.add
      .text(titleX, titleY, options.title, {
        color: this.palette(options.style).title,
        fontFamily: "Rajdhani",
        fontSize: `${titleSize}px`,
        fontStyle: "bold",
        letterSpacing: options.style === "white" ? 2 : 1,
      })
      .setOrigin(0, options.subtitle === undefined ? 0.5 : 0);
    const subtitle =
      options.subtitle === undefined
        ? undefined
        : this.add.text(
            options.style === "white" ? 106 : 68,
            options.style === "white" ? 88 : titleY + 28,
            options.subtitle,
            {
              color: this.palette(options.style).subtitle,
              fontFamily: "Rajdhani",
              fontSize: options.style === "white" ? "16px" : "13px",
              fontStyle: "bold",
              letterSpacing: 1.5,
            },
          );
    if (options.style === "cyan" || options.style === "dark") {
      const textWidth = Math.max(title.width, subtitle?.width ?? 0);
      const contentWidth = 32 + 16 + textWidth;
      const contentLeft = (options.width - contentWidth) / 2;
      const contentShift = contentLeft - 22;
      icon.x = iconOffset + contentShift / 2;
      title.x += contentShift / 2;
      if (subtitle !== undefined) {
        subtitle.x += contentShift / 2;
      }
    }

    const draw = (hovered: boolean): void => {
      const palette = this.palette(options.style);
      const skew = Math.round(options.height * 0.105);
      surface.clear();
      surface.fillStyle(hovered ? palette.hover : palette.fill, palette.alpha);
      surface.fillPoints(
        [
          new Phaser.Math.Vector2(skew, 0),
          new Phaser.Math.Vector2(options.width, 0),
          new Phaser.Math.Vector2(options.width - skew, options.height),
          new Phaser.Math.Vector2(0, options.height),
        ],
        true,
      );
      surface.lineStyle(
        options.style === "white" ? 2 : 1,
        hovered ? palette.borderHover : palette.border,
        1,
      );
      surface.strokePoints(
        [
          new Phaser.Math.Vector2(skew, 0),
          new Phaser.Math.Vector2(options.width, 0),
          new Phaser.Math.Vector2(options.width - skew, options.height),
          new Phaser.Math.Vector2(0, options.height),
        ],
        true,
        true,
      );
      if (options.style !== "white") {
        surface.fillStyle(palette.accent, 1);
        surface.fillPoints(
          [
            new Phaser.Math.Vector2(skew, 0),
            new Phaser.Math.Vector2(skew + 5, 0),
            new Phaser.Math.Vector2(5, options.height),
            new Phaser.Math.Vector2(0, options.height),
          ],
          true,
        );
      }
      this.drawIcon(icon, options.icon, options.style, hovered, options.height);
    };
    draw(false);

    hitArea.on("pointerover", () => {
      draw(true);
      container.x = options.x + 4;
      this.sound.play(ASSETS.select, {
        volume: scaledSfxVolume(0.16, this.audioSettings),
      });
    });
    hitArea.on("pointerout", () => {
      draw(false);
      container.x = options.x;
    });
    hitArea.on("pointerdown", () => {
      container.setScale(0.99);
    });
    hitArea.on("pointerup", () => {
      container.setScale(1);
      this.sound.play(ASSETS.confirm, {
        volume: scaledSfxVolume(0.25, this.audioSettings),
      });
      options.onClick?.();
    });

    container.add([surface, icon, title]);
    if (subtitle !== undefined) {
      container.add(subtitle);
    }
    container.add(hitArea);
    return container;
  }

  private palette(style: ButtonStyle): {
    accent: number;
    alpha: number;
    border: number;
    borderHover: number;
    fill: number;
    hover: number;
    icon: number;
    subtitle: string;
    title: string;
  } {
    switch (style) {
      case "cyan":
        return {
          accent: 0xeef6fa,
          alpha: 0.96,
          border: 0x268eb5,
          borderHover: 0x8ce2ff,
          fill: 0x238eb8,
          hover: 0x35c5f2,
          icon: 0xffffff,
          subtitle: "#d9f5ff",
          title: "#ffffff",
        };
      case "white":
        return {
          accent: 0xffd23f,
          alpha: 0.96,
          border: 0xffd23f,
          borderHover: 0xffe37a,
          fill: 0xe9edf1,
          hover: 0xffffff,
          icon: 0x20252d,
          subtitle: "#626a73",
          title: "#20252d",
        };
      case "danger":
        return {
          accent: 0xe8392e,
          alpha: 0.93,
          border: 0x843b39,
          borderHover: 0xe8392e,
          fill: 0x201417,
          hover: 0x37191c,
          icon: 0xff7770,
          subtitle: "#cc8c88",
          title: "#f1b0ac",
        };
      case "utility":
        return {
          accent: 0x35c5f2,
          alpha: 0.96,
          border: 0xd9e0e5,
          borderHover: 0xffffff,
          fill: 0xe9edf1,
          hover: 0xffffff,
          icon: 0x1f8fe0,
          subtitle: "#67717b",
          title: "#25303a",
        };
      default:
        return {
          accent: 0x35c5f2,
          alpha: 0.91,
          border: 0x4b6070,
          borderHover: 0x72cbe8,
          fill: 0x111820,
          hover: 0x1d2a34,
          icon: 0x35c5f2,
          subtitle: "#8497a4",
          title: "#e2edf2",
        };
    }
  }

  private drawIcon(
    graphics: Phaser.GameObjects.Graphics,
    type: MenuIcon,
    style: ButtonStyle,
    hovered: boolean,
    height: number,
  ): void {
    const color = hovered
      ? style === "white" || style === "utility"
        ? 0x1f8fe0
        : 0xffffff
      : this.palette(style).icon;
    const y = height / 2;
    graphics.clear();
    graphics.lineStyle(3, color, 1);
    graphics.fillStyle(color, 1);
    switch (type) {
      case "play":
        graphics.fillStyle(0x161b22, 1);
        graphics.fillRoundedRect(22, y - 34, 68, 68, 7);
        graphics.lineStyle(3, hovered ? 0x35c5f2 : 0xdce3e8, 1);
        graphics.strokeCircle(56, y, 22);
        graphics.fillStyle(hovered ? 0x35c5f2 : 0xdce3e8, 1);
        graphics.fillTriangle(49, y - 13, 49, y + 13, 69, y);
        break;
      case "shop":
        graphics.strokeRect(24, y - 12, 28, 24);
        graphics.lineBetween(29, y - 18, 47, y - 18);
        graphics.lineBetween(29, y - 18, 24, y - 12);
        graphics.lineBetween(47, y - 18, 52, y - 12);
        break;
      case "leaderboard":
        graphics.fillRect(23, y + 3, 6, 13);
        graphics.fillRect(33, y - 5, 6, 21);
        graphics.fillRect(43, y - 15, 6, 31);
        break;
      case "achievement": {
        const points: Phaser.Math.Vector2[] = [];
        for (let index = 0; index < 10; index += 1) {
          const angle = -Math.PI / 2 + (index * Math.PI) / 5;
          const radius = index % 2 === 0 ? 17 : 7;
          points.push(
            new Phaser.Math.Vector2(
              37 + Math.cos(angle) * radius,
              y + Math.sin(angle) * radius,
            ),
          );
        }
        graphics.strokePoints(points, true, true);
        break;
      }
      case "settings":
        graphics.lineBetween(22, y - 12, 52, y - 12);
        graphics.lineBetween(22, y, 52, y);
        graphics.lineBetween(22, y + 12, 52, y + 12);
        graphics.fillCircle(31, y - 12, 4);
        graphics.fillCircle(44, y, 4);
        graphics.fillCircle(35, y + 12, 4);
        break;
      case "quit":
        graphics.lineBetween(26, y - 12, 48, y + 12);
        graphics.lineBetween(48, y - 12, 26, y + 12);
        break;
      case "notice":
        graphics.strokeCircle(36, y, 14);
        graphics.lineBetween(36, y - 8, 36, y + 3);
        graphics.fillCircle(36, y + 9, 2);
        break;
    }
  }

  private beginPlay(): void {
    this.input.enabled = false;
    const transitionProfile = nextNikkeTransitionProfile();
    playHexWipeCover(
      this,
      () => {
        this.scene.launch("character-select", {
          previousScene: "main-menu",
          revealTransition: true,
          transitionProfile,
        });
      },
      transitionProfile,
    );
  }

  private openSettings(): void {
    this.input.enabled = false;
    const transitionProfile = nextNikkeTransitionProfile();
    playHexWipeCover(
      this,
      () => {
        this.scene.launch("settings", {
          previousScene: "main-menu",
          revealTransition: true,
          transitionProfile,
        });
      },
      transitionProfile,
    );
  }

  private openAchievements(): void {
    if (!this.input.enabled) {
      return;
    }
    this.input.enabled = false;
    const transitionProfile = nextNikkeTransitionProfile();
    playHexWipeCover(
      this,
      () => {
        this.scene.launch("achievements", {
          previousScene: "main-menu",
          revealTransition: true,
          transitionProfile,
        });
      },
      transitionProfile,
    );
  }

  private openRecords(): void {
    if (!this.input.enabled) {
      return;
    }
    this.input.enabled = false;
    const transitionProfile = nextNikkeTransitionProfile();
    playHexWipeCover(
      this,
      () => {
        this.scene.launch("records", {
          previousScene: "main-menu",
          revealTransition: true,
          transitionProfile,
        });
      },
      transitionProfile,
    );
  }

  private openShop(): void {
    if (!this.input.enabled) {
      return;
    }
    this.input.enabled = false;
    const transitionProfile = nextNikkeTransitionProfile();
    playHexWipeCover(
      this,
      () => {
        this.scene.launch("shop", {
          previousScene: "main-menu",
          revealTransition: true,
          transitionProfile,
        });
      },
      transitionProfile,
    );
  }
}

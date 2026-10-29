import { KIT_INFO } from "../../survivor/kit-info";
import { cores } from "../ui/cores";
import { openSkinSelection } from '../ui/SkinSelection';
import { characterSkins, equippedSkin, ownsSkin } from '../profile/Skins';
import Phaser from "phaser";
import { bleed, pinToEdge, view } from "../rendering/DisplayQualityPlugin";
import { openLobbyTalentTree } from "../ui/LobbyTalentTree";

import {
  gameAudio,
  preloadCharacterSelectionVoices,
  preloadLobbyAudio,
} from "../audio/GameAudio";
import { captureDevelopmentPreview } from "../dev/capturePreview";
import {
  CHARACTERS,
  characterBurstPath,
  characterLockReason,
  canPreviewCharacterTalents,
  type CharacterDefinition,
  loadRosterState,
  saveSelectedCharacter,
} from "../profile/CharacterRoster";
import {
  getCharacterTalents,
  TALENT_TREE_TABS,
  type TalentDefinition,
  type TalentTreeId,
} from "../profile/TalentData";
import {
  isMainProgressionTalent,
  isMasteryTalent,
  TALENT_MASTERY_HEIGHT,
  TALENT_NODE_HEIGHT,
  TALENT_NODE_WIDTH,
  talentTreePosition,
} from "../profile/TalentTreeLayout";
import {
  type AudioSettings,
  loadAudioSettings,
  scaledSfxVolume,
} from "../settings/GameSettings";
import { CombatKeywordText } from "../ui/text/CombatKeywordText";
import {
  nextNikkeTransitionProfile,
  playHexWipeCover,
  playHexWipeReveal,
  type HexWipeProfile,
} from "../ui/transitions/HexWipeTransition";

const WIDTH = 1920;
const HEIGHT = 1080;
const CARD_WIDTH = 165;
const CARD_HEIGHT = 252;
const CARD_GAP = 18;
const GRID_X = 66;
const GRID_Y = 198;
const ART_X = 752;
const ART_WIDTH = 620;

const AUDIO = {
  confirm: "character-select-confirm",
  select: "character-select-hover",
} as const;

interface CharacterSelectSceneData {
  readonly previousScene?: string;
  readonly revealTransition?: boolean;
  readonly transitionProfile?: HexWipeProfile;
}

interface CharacterCard {
  readonly character?: CharacterDefinition;
  readonly container: Phaser.GameObjects.Container;
  readonly redraw: (hovered: boolean, selected: boolean) => void;
}

export class CharacterSelectScene extends Phaser.Scene {
  private artBackground?: Phaser.GameObjects.Graphics;
  private artEdges?: Phaser.GameObjects.Graphics;
  private artImage?: Phaser.GameObjects.Image;
  private artMask?: Phaser.GameObjects.Graphics;
  private audioSettings: AudioSettings = loadAudioSettings();
  private readonly cards: CharacterCard[] = [];
  private currentCharacter: CharacterDefinition = CHARACTERS[0]!;
  private detailLayer?: Phaser.GameObjects.Container;
  private heroDrift?: Phaser.Tweens.Tween;
  private operatorChip?: Phaser.GameObjects.Container;
  private previousScene?: string;
  private revealTransition = false;
  private roster = loadRosterState();
  private activeTalentTree: TalentTreeId = "attack";
  private talentTreeLayer?: Phaser.GameObjects.Container;
  private transitionProfile?: HexWipeProfile;
  private wash?: Phaser.GameObjects.Rectangle;

  public constructor() {
    super("character-select");
  }

  public init(data: CharacterSelectSceneData = {}): void {
    this.previousScene = data.previousScene;
    this.revealTransition = data.revealTransition ?? false;
    this.transitionProfile = data.transitionProfile;
  }

  public preload(): void {
    CHARACTERS.forEach((character) => {
      this.load.image(this.portraitKey(character), character.portraitPath);
      characterSkins(character.id).forEach((skin) => {
        this.load.image(`skin-preview-${skin.id}`, skin.icon);
      });
    });
    const selectedId = loadRosterState().selectedCharacterId;
    this.load.image(
      this.burstKey(
        CHARACTERS.find((character) => character.id === selectedId) ??
          CHARACTERS[0]!,
      ),
      characterBurstPath(selectedId),
    );
    this.load.audio(AUDIO.select, "assets/audio/ui/select.wav");
    this.load.audio(AUDIO.confirm, "assets/audio/ui/confirm.wav");
    preloadLobbyAudio(this);
    preloadCharacterSelectionVoices(this);
  }

  public create(): void {
    this.audioSettings = loadAudioSettings();
    this.roster = loadRosterState();
    this.cards.length = 0;
    this.currentCharacter =
      CHARACTERS.find(
        (character) => character.id === this.roster.selectedCharacterId,
      ) ?? CHARACTERS[0]!;

    this.createBackdrop();
    this.createHeroStrip();
    this.createHeader();
    this.renderOperatorChip();
    this.createRosterGrid();
    this.renderDetailPanel(false);
    this.createBackButton();
    gameAudio.stopEnvironmentAmbience();
    gameAudio.playLobby(this);
    gameAudio.playCharacterSelectionVoice(this, this.currentCharacter.id);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      gameAudio.stopCharacterSelectionVoice();
    });

    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.talentTreeLayer !== undefined) {
        this.closeTalentTree();
      } else {
        this.goBack();
      }
    });
    if (this.revealTransition) {
      playHexWipeReveal(this, this.transitionProfile ?? "ROSTER ACCESS");
      if (this.previousScene !== undefined) {
        this.scene.stop(this.previousScene);
      }
    } else {
      this.cameras.main.fadeIn(260, 8, 13, 18);
    }
    captureDevelopmentPreview(this, "character-select");
  }

  private createBackdrop(): void {
    this.add.rectangle(bleed.left, 0, bleed.width, HEIGHT, 0xe9edf1).setOrigin(0);
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x81909c, 0.08);
    for (let x = bleed.left - 360; x < bleed.right + 360; x += 205) {
      grid.lineBetween(x, 76, x + 430, HEIGHT - 48);
    }
    grid.lineStyle(1, 0x81909c, 0.045);
    for (let y = 178; y < HEIGHT - 48; y += 116) {
      grid.lineBetween(bleed.left, y, bleed.right, y);
    }

    this.wash = this.add
      .rectangle(bleed.left, 76, bleed.width, HEIGHT - 124, this.currentCharacter.accent, 0.07)
      .setOrigin(0);

    const chrome = this.add.graphics().setDepth(60);
    chrome.fillStyle(0x090d12, 0.97);
    chrome.fillRect(bleed.left, 0, bleed.width, 76);
    chrome.fillRect(bleed.left, HEIGHT - 48, bleed.width, 48);
    chrome.fillStyle(0x35c5f2, 1);
    chrome.fillRect(bleed.left, 74, 515 - bleed.left, 3);
    chrome.fillStyle(0xaeb7c1, 0.28);
    chrome.fillRect(515, 75, bleed.right - 515, 1);

    pinToEdge(this.add
      .text(view.left + 52, 25, "ARK SYSTEM / PERSONNEL", {
        color: "#f2f5f7",
        fontFamily: "Rajdhani",
        fontSize: "26px",
        fontStyle: "bold",
        letterSpacing: 1.8,
      }), "left")
      .setDepth(61);
    pinToEdge(this.add
      .text(view.right - 146, 26, "03", {
        color: "#9aa4af",
        fontFamily: "Rajdhani",
        fontSize: "25px",
        fontStyle: "bold",
      }), "right")
      .setDepth(61);
    pinToEdge(this.add
      .text(view.left + 52, 1038, "SQUAD FILE // PERSONNEL DATABASE", {
        color: "#8a949f",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 2,
      }), "left")
      .setDepth(61);
    pinToEdge(this.add
      .text(view.right - 294, 1038, "1 OPERATIVE REQUIRED", {
        color: "#35c5f2",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 1.5,
      }), "right")
      .setDepth(61);
  }

  private createHeader(): void {
    this.add
      .text(66, 100, "CHARACTERS", {
        color: "#20262d",
        fontFamily: "Rajdhani",
        fontSize: "56px",
        fontStyle: "bold",
        letterSpacing: 2,
      })
      .setDepth(20);
    this.add
      .text(69, 161, "SELECT YOUR NIKKE // SQUAD FILE", {
        color: "#65717c",
        fontFamily: "Rajdhani",
        fontSize: "17px",
        fontStyle: "bold",
        letterSpacing: 2.5,
      })
      .setDepth(20);
    const rule = this.add.graphics().setDepth(20);
    rule.fillStyle(0x35c5f2, 1);
    rule.fillRect(69, 188, 80, 3);
    rule.fillStyle(0x697580, 0.24);
    rule.fillRect(149, 189, 556, 1);
  }

  private createHeroStrip(): void {
    this.artBackground = this.add.graphics().setDepth(2);
    this.artBackground.fillStyle(0x17212b, 1);
    this.artBackground.fillPoints(this.artPolygon(ART_X, ART_WIDTH), true);

    this.artImage = this.add
      .image(ART_X + ART_WIDTH / 2, 540, this.burstKey(this.currentCharacter))
      .setDepth(3);
    this.fitHeroImage(this.currentCharacter);
    this.artMask = this.add.graphics();
    this.children.remove(this.artMask);
    this.drawHeroMask();
    this.artImage
      .enableFilters()
      .filters!.external.addMask(this.artMask, false, this.cameras.main);

    this.artEdges = this.add.graphics().setDepth(5);
    this.artEdges.lineStyle(2, 0x35c5f2, 0.85);
    const points = this.artPolygon(ART_X, ART_WIDTH);
    this.artEdges.lineBetween(
      points[0]!.x,
      points[0]!.y,
      points[3]!.x,
      points[3]!.y,
    );
    this.artEdges.lineStyle(1, 0xffffff, 0.5);
    this.artEdges.lineBetween(
      points[1]!.x,
      points[1]!.y,
      points[2]!.x,
      points[2]!.y,
    );
    this.beginHeroDrift();
  }

  private artPolygon(x: number, width: number): Phaser.Math.Vector2[] {
    return [
      new Phaser.Math.Vector2(x + 145, 76),
      new Phaser.Math.Vector2(x + width, 76),
      new Phaser.Math.Vector2(x + width - 145, HEIGHT - 48),
      new Phaser.Math.Vector2(x, HEIGHT - 48),
    ];
  }

  private drawHeroMask(): void {
    this.artMask?.clear();
    this.artMask?.fillStyle(0xffffff, 1);
    this.artMask?.fillPoints(this.artPolygon(ART_X, ART_WIDTH), true);
  }

  private fitHeroImage(character: CharacterDefinition): void {
    if (this.artImage === undefined) {
      return;
    }
    const source = this.textures
      .get(this.burstKey(character))
      .getSourceImage() as HTMLImageElement;
    const scale =
      Math.max((ART_WIDTH + 165) / source.width, 1032 / source.height) * 1.03;
    // Dorothy's framing sits halfway between the earlier offset and top alignment.
    const centerY = character.id === 'dorothy' ? (662 + 76 + source.height * scale / 2) / 2 : 552;
    this.artImage.setScale(scale).setPosition(ART_X + ART_WIDTH / 2, centerY);
  }

  private beginHeroDrift(): void {
    const targets = this.heroTargets();
    if (targets.length === 0) {
      return;
    }
    this.heroDrift?.stop();
    this.heroDrift = this.tweens.add({
      duration: 5200,
      ease: "Sine.InOut",
      repeat: -1,
      targets,
      x: "+=16",
      yoyo: true,
    });
  }

  private heroTargets(): Array<
    Phaser.GameObjects.Graphics | Phaser.GameObjects.Image
  > {
    return [
      this.artBackground,
      this.artImage,
      this.artEdges,
      this.artMask,
    ].filter(
      (
        target,
      ): target is Phaser.GameObjects.Graphics | Phaser.GameObjects.Image =>
        target !== undefined,
    );
  }

  private createRosterGrid(): void {
    CHARACTERS.forEach((character, index) => {
      const card = this.createCharacterCard(character, index);
      this.cards.push(card);
    });
    this.cards.push(this.createRandomCard(CHARACTERS.length));
  }

  private createCharacterCard(
    character: CharacterDefinition,
    index: number,
  ): CharacterCard {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const x = GRID_X + column * (CARD_WIDTH + CARD_GAP);
    const y = GRID_Y + row * (CARD_HEIGHT + CARD_GAP);
    const container = this.add.container(x, y).setDepth(18);
    const surface = this.add.graphics();
    const portrait = this.add
      .image(CARD_WIDTH / 2, 96, this.portraitKey(character))
      .setDisplaySize(CARD_WIDTH - 8, 188);
    const locked = !this.isUnlocked(character);
    if (locked) {
      portrait.setTint(0x8b9299);
    }
    const lockOverlay = this.add.graphics();
    const textLayer = this.add.container(0, 0);
    const weapon = this.add.text(12, 12, character.weaponTag, {
      color: "#f4f7f9",
      fontFamily: "Rajdhani",
      fontSize: "15px",
      fontStyle: "bold",
      letterSpacing: 1,
    });
    const indexText = this.add
      .text(CARD_WIDTH - 12, 12, `${index + 1}`.padStart(2, "0"), {
        color: "#f4f7f9",
        fontFamily: "Rajdhani",
        fontSize: "13px",
        fontStyle: "bold",
      })
      .setOrigin(1, 0);
    const name = this.add.text(12, 207, character.name, {
      color: locked ? "#808992" : "#20262d",
      fontFamily: "Rajdhani",
      fontSize: character.name.length > 10 ? "17px" : "20px",
      fontStyle: "bold",
      letterSpacing: 0.8,
    });
    const state = this.add.text(
      12,
      232,
      locked
        ? (characterLockReason(character.id) ??
            `${cores(character.unlockCost)} // SHOP`)
        : "AVAILABLE",
      {
        color: locked ? "#9a6c35" : "#1f8fe0",
        fontFamily: "Rajdhani",
        fontSize: "12px",
        fontStyle: "bold",
        letterSpacing: 1,
      },
    );
    textLayer.add([weapon, indexText, name, state]);

    const hit = this.add
      .rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    const redraw = (hovered: boolean, selected: boolean): void => {
      surface.clear();
      lockOverlay.clear();
      surface.fillStyle(locked ? 0xd9dde1 : 0xf8fafb, 1);
      surface.fillPoints(
        [
          new Phaser.Math.Vector2(0, 0),
          new Phaser.Math.Vector2(CARD_WIDTH, 0),
          new Phaser.Math.Vector2(CARD_WIDTH, CARD_HEIGHT - 14),
          new Phaser.Math.Vector2(CARD_WIDTH - 14, CARD_HEIGHT),
          new Phaser.Math.Vector2(0, CARD_HEIGHT),
        ],
        true,
      );
      surface.fillStyle(0x101820, locked ? 0.55 : 0.28);
      surface.fillRect(4, 4, CARD_WIDTH - 8, 188);
      surface.fillStyle(locked ? 0x747d86 : character.accent, 0.94);
      surface.fillRect(4, 4, CARD_WIDTH - 8, 29);
      surface.lineStyle(
        selected ? 3 : 1,
        selected ? 0xffd23f : hovered ? 0x35c5f2 : 0xaeb7c1,
        1,
      );
      surface.strokePoints(
        [
          new Phaser.Math.Vector2(0, 0),
          new Phaser.Math.Vector2(CARD_WIDTH, 0),
          new Phaser.Math.Vector2(CARD_WIDTH, CARD_HEIGHT - 14),
          new Phaser.Math.Vector2(CARD_WIDTH - 14, CARD_HEIGHT),
          new Phaser.Math.Vector2(0, CARD_HEIGHT),
        ],
        true,
        true,
      );
      if (selected) {
        this.drawSelectionBrackets(surface);
      }
      if (locked) {
        lockOverlay.fillStyle(0x101820, 0.58);
        lockOverlay.fillRect(4, 4, CARD_WIDTH - 8, 188);
        this.drawLock(lockOverlay, CARD_WIDTH / 2, 101);
      }
    };
    redraw(false, this.currentCharacter.id === character.id);
    hit.on("pointerover", () => {
      redraw(true, this.currentCharacter.id === character.id);
      container.x = x + 2;
      this.sound.play(AUDIO.select, {
        volume: scaledSfxVolume(0.12, this.audioSettings),
      });
    });
    hit.on("pointerout", () => {
      redraw(false, this.currentCharacter.id === character.id);
      container.x = x;
    });
    hit.on("pointerup", () => this.selectCharacter(character));
    container.add([surface, portrait, lockOverlay, textLayer, hit]);
    return { character, container, redraw };
  }

  private createRandomCard(index: number): CharacterCard {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const x = GRID_X + column * (CARD_WIDTH + CARD_GAP);
    const y = GRID_Y + row * (CARD_HEIGHT + CARD_GAP);
    const container = this.add.container(x, y).setDepth(18);
    const surface = this.add.graphics();
    const title = this.add
      .text(CARD_WIDTH / 2, 147, "RANDOM", {
        color: "#ffffff",
        fontFamily: "Rajdhani",
        fontSize: "22px",
        fontStyle: "bold",
        letterSpacing: 1.5,
      })
      .setOrigin(0.5);
    const subtitle = this.add
      .text(CARD_WIDTH / 2, 178, "AVAILABLE POOL", {
        color: "#d8f6ff",
        fontFamily: "Rajdhani",
        fontSize: "12px",
        fontStyle: "bold",
        letterSpacing: 1.2,
      })
      .setOrigin(0.5);
    const icon = this.add
      .text(CARD_WIDTH / 2, 82, "?", {
        color: "#ffffff",
        fontFamily: "Rajdhani",
        fontSize: "68px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const hit = this.add
      .rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    const redraw = (hovered: boolean): void => {
      surface.clear();
      surface.fillStyle(hovered ? 0x35c5f2 : 0x238eb8, 0.96);
      surface.fillPoints(
        [
          new Phaser.Math.Vector2(0, 0),
          new Phaser.Math.Vector2(CARD_WIDTH, 0),
          new Phaser.Math.Vector2(CARD_WIDTH, CARD_HEIGHT - 14),
          new Phaser.Math.Vector2(CARD_WIDTH - 14, CARD_HEIGHT),
          new Phaser.Math.Vector2(0, CARD_HEIGHT),
        ],
        true,
      );
      surface.lineStyle(hovered ? 2 : 1, hovered ? 0xffffff : 0x8ce2ff, 1);
      surface.strokePoints(
        [
          new Phaser.Math.Vector2(0, 0),
          new Phaser.Math.Vector2(CARD_WIDTH, 0),
          new Phaser.Math.Vector2(CARD_WIDTH, CARD_HEIGHT - 14),
          new Phaser.Math.Vector2(CARD_WIDTH - 14, CARD_HEIGHT),
          new Phaser.Math.Vector2(0, CARD_HEIGHT),
        ],
        true,
        true,
      );
      surface.lineStyle(1, 0xffffff, 0.14);
      for (let offset = -180; offset < 180; offset += 22) {
        surface.lineBetween(offset, 0, offset + 180, CARD_HEIGHT);
      }
    };
    redraw(false);
    hit.on("pointerover", () => {
      redraw(true);
      container.x = x + 2;
      this.sound.play(AUDIO.select, {
        volume: scaledSfxVolume(0.12, this.audioSettings),
      });
    });
    hit.on("pointerout", () => {
      redraw(false);
      container.x = x;
    });
    hit.on("pointerup", () => {
      const available = CHARACTERS.filter((character) =>
        this.isUnlocked(character),
      );
      const choice = Phaser.Utils.Array.GetRandom(available);
      this.selectCharacter(choice);
    });
    container.add([surface, icon, title, subtitle, hit]);
    return { container, redraw: (hovered: boolean) => redraw(hovered) };
  }

  private drawSelectionBrackets(graphics: Phaser.GameObjects.Graphics): void {
    graphics.lineStyle(4, 0xffd23f, 1);
    const size = 18;
    graphics.lineBetween(-5, 14, -5, -5);
    graphics.lineBetween(-5, -5, size, -5);
    graphics.lineBetween(CARD_WIDTH - size, -5, CARD_WIDTH + 5, -5);
    graphics.lineBetween(CARD_WIDTH + 5, -5, CARD_WIDTH + 5, 14);
    graphics.lineBetween(-5, CARD_HEIGHT - 14, -5, CARD_HEIGHT + 5);
    graphics.lineBetween(-5, CARD_HEIGHT + 5, size, CARD_HEIGHT + 5);
    graphics.lineBetween(
      CARD_WIDTH - size,
      CARD_HEIGHT + 5,
      CARD_WIDTH + 5,
      CARD_HEIGHT + 5,
    );
    graphics.lineBetween(
      CARD_WIDTH + 5,
      CARD_HEIGHT + 5,
      CARD_WIDTH + 5,
      CARD_HEIGHT - 14,
    );
  }

  private drawLock(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
  ): void {
    graphics.lineStyle(4, 0xf4f6f8, 1);
    graphics.beginPath();
    graphics.moveTo(x - 11, y - 2);
    graphics.lineTo(x - 11, y - 7);
    graphics.arc(x, y - 7, 11, Math.PI, Math.PI * 2, false);
    graphics.lineTo(x + 11, y - 2);
    graphics.strokePath();
    graphics.fillStyle(0xf4f6f8, 1);
    graphics.fillRoundedRect(x - 17, y - 3, 34, 27, 4);
    graphics.fillStyle(0x26313a, 1);
    graphics.fillCircle(x, y + 8, 3);
    graphics.fillRect(x - 1.5, y + 9, 3, 7);
  }

  private selectCharacter(character: CharacterDefinition): void {
    if (character.id === this.currentCharacter.id) {
      gameAudio.playCharacterSelectionVoice(this, character.id);
      return;
    }
    this.sound.play(AUDIO.confirm, {
      volume: scaledSfxVolume(0.22, this.audioSettings),
    });
    this.currentCharacter = character;
    // Voice previews are available even while the gameplay kit is still locked.
    gameAudio.playCharacterSelectionVoice(this, character.id);
    if (this.isUnlocked(character)) {
      saveSelectedCharacter(character.id);
      this.roster = loadRosterState();
      this.renderOperatorChip();
    }
    this.cards.forEach((card) => {
      card.redraw(false, card.character?.id === character.id);
    });
    this.wash?.setFillStyle(character.accent, 0.07);
    this.swapHero(character);
    this.renderDetailPanel(true);
  }

  private swapHero(character: CharacterDefinition): void {
    if (this.artImage === undefined || this.artBackground === undefined) {
      return;
    }
    const textureKey = this.burstKey(character);
    if (!this.textures.exists(textureKey)) {
      this.load.image(textureKey, characterBurstPath(character.id));
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (this.currentCharacter.id === character.id) this.swapHero(character);
      });
      if (!this.load.isLoading()) this.load.start();
      return;
    }
    this.heroDrift?.stop();
    const image = this.artImage;
    const targets = this.heroTargets();
    this.tweens.add({
      duration: 125,
      ease: "Quad.In",
      onComplete: () => {
        const stripOffset = this.artBackground?.x ?? 0;
        image.setTexture(textureKey);
        this.fitHeroImage(character);
        image.x += stripOffset;
        image.setAlpha(0);
        this.tweens.add({
          duration: 220,
          ease: "Cubic.Out",
          onComplete: () => {
            image.setAlpha(1);
            this.beginHeroDrift();
          },
          targets,
          x: "-=54",
        });
        this.tweens.add({ alpha: 1, duration: 170, targets: image });
      },
      targets,
      x: "+=54",
    });
    this.tweens.add({ alpha: 0, duration: 105, targets: image });
  }

  private renderDetailPanel(animate: boolean): void {
    this.detailLayer?.destroy(true);
    const root = this.add.container(1370, 166).setDepth(22);
    this.detailLayer = root;
    const width = 484;
    const height = 860;
    const unlocked = this.isUnlocked(this.currentCharacter);
    const surface = this.add.graphics();
    surface.fillStyle(0xf8fafb, 0.98);
    surface.fillPoints(
      [
        new Phaser.Math.Vector2(12, 0),
        new Phaser.Math.Vector2(width, 0),
        new Phaser.Math.Vector2(width, height - 18),
        new Phaser.Math.Vector2(width - 18, height),
        new Phaser.Math.Vector2(0, height),
        new Phaser.Math.Vector2(0, 12),
      ],
      true,
    );
    surface.lineStyle(1, 0xaeb8c1, 1);
    surface.strokePoints(
      [
        new Phaser.Math.Vector2(12, 0),
        new Phaser.Math.Vector2(width, 0),
        new Phaser.Math.Vector2(width, height - 18),
        new Phaser.Math.Vector2(width - 18, height),
        new Phaser.Math.Vector2(0, height),
        new Phaser.Math.Vector2(0, 12),
      ],
      true,
      true,
    );
    surface.fillStyle(this.currentCharacter.accent, 1);
    surface.fillRect(0, 0, 7, 124);
    root.add(surface);

    root.add(
      this.add.text(34, 29, this.currentCharacter.name, {
        color: "#20262d",
        fontFamily: "Rajdhani",
        fontSize: this.currentCharacter.name.length > 10 ? "43px" : "51px",
        fontStyle: "bold",
        letterSpacing: 1.5,
      }),
    );
    root.add(
      this.add.text(
        36,
        88,
        `${this.currentCharacter.squad} // ${this.currentCharacter.weapon}`,
        {
          color: "#66727e",
          fontFamily: "Rajdhani",
          fontSize: "16px",
          fontStyle: "bold",
          letterSpacing: 1.6,
        },
      ),
    );
    root.add(
      this.add.text(36, 122, this.currentCharacter.description, {
        color: "#4f5a65",
        fontFamily: "Rajdhani",
        fontSize: "17px",
        fontStyle: "500",
        lineSpacing: 4,
        wordWrap: { width: 414 },
      }),
    );
    const kit = KIT_INFO[this.currentCharacter.id as keyof typeof KIT_INFO];
    if (kit) {
      root.add(
        this.add.text(36, 148, `PASSIVE // ${kit.passiveName.toUpperCase()}`, {
          color: "#9a7310",
          fontFamily: "Rajdhani",
          fontSize: "13px",
          fontStyle: "bold",
          letterSpacing: 1.7,
        }),
      );
      root.add(
        this.add.text(36, 165, kit.passiveSummary, {
          color: "#59646f",
          fontFamily: "Rajdhani",
          fontSize: "14px",
          fontStyle: "500",
          wordWrap: { width: 414 },
        }),
      );
    }
    const rule = this.add.graphics();
    rule.fillStyle(0x35c5f2, 1);
    rule.fillRect(36, 190, 70, 3);
    rule.fillStyle(0x8d98a3, 0.28);
    rule.fillRect(106, 191, 340, 1);
    root.add(rule);

    root.add(
      this.add.text(36, 201, "COMBAT PARAMETERS", {
        color: "#87919b",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "bold",
        letterSpacing: 1.8,
      }),
    );
    this.addStat(root, 36, 226, "HP", this.currentCharacter.hp, 100);
    this.addStat(root, 36, 257, "ATK", this.currentCharacter.attack, 20);
    this.addStat(root, 36, 288, "SPD", this.currentCharacter.speed, 100);
    this.addStat(root, 36, 319, "CRIT", this.currentCharacter.crit, 100, "%");

    this.addAbility(
      root,
      36,
      356,
      "SPECIAL",
      this.currentCharacter.specialName,
      this.currentCharacter.specialDescription,
      0x35c5f2,
    );
    this.addAbility(
      root,
      36,
      478,
      "BURST",
      this.currentCharacter.burstName,
      this.currentCharacter.burstDescription,
      0xffd23f,
    );

    if (characterSkins(this.currentCharacter.id).length > 0) {
      this.addSkinPreviews(root);
    } else {
      root.add(this.add.text(36, 620,
        `LOCKED // ${characterLockReason(this.currentCharacter.id) ?? `RECRUIT FROM SHOP // ${cores(this.currentCharacter.unlockCost)}`}`, {
          color: "#7e5930", fontFamily: "Rajdhani", fontSize: "16px",
          fontStyle: "bold", wordWrap: { width: 412 },
        }));
    }
    root.add(this.createTalentTreeButton(36, 708, 412, 42));
    root.add(this.createDeployButton(36, 772, 412, 72, unlocked));

    if (animate) {
      root.setAlpha(0).setX(1404);
      this.tweens.add({
        alpha: 1,
        duration: 220,
        ease: "Cubic.Out",
        targets: root,
        x: 1370,
      });
    }
  }

  private addSkinPreviews(root: Phaser.GameObjects.Container): void {
    const skins = characterSkins(this.currentCharacter.id);
    const equipped = equippedSkin(this.currentCharacter.id);
    const heading = this.add.text(36, 608, `SKINS / ${equipped?.name.toUpperCase() ?? 'DEFAULT'}`, {
      color: "#65717c", fontFamily: "Rajdhani", fontSize: "14px",
      fontStyle: "bold", letterSpacing: 1,
    });
    root.add(heading);
    const step = 416 / Math.max(4, skins.length);
    const tileWidth = step - 8;
    skins.forEach((skin, index) => {
      const x = 36 + index * step;
      const selected = skin.id === equipped?.id;
      const owned = ownsSkin(skin);
      const surface = this.add.graphics();
      const draw = (hovered: boolean): void => {
        surface.clear();
        surface.fillStyle(selected ? 0xe0f5fc : 0xe9edf1, 1);
        surface.fillRect(x, 632, tileWidth, 60);
        surface.lineStyle(selected || hovered ? 2 : 1, selected || hovered ? 0x238eb8 : 0xb6c1ca, 1);
        surface.strokeRect(x, 632, tileWidth, 60);
        if (selected) surface.fillStyle(0x238eb8, 1).fillRect(x, 689, tileWidth, 3);
      };
      draw(false);
      const icon = this.add.image(x + tileWidth / 2, 662, `skin-preview-${skin.id}`);
      icon.setScale(Math.min((tileWidth - 8) / icon.width, 56 / icon.height));
      const lockOverlay = this.add.graphics();
      if (!owned) {
        icon.setTint(0x8b9299);
        lockOverlay.fillStyle(0x101820, 0.58);
        lockOverlay.fillRect(x + 2, 634, tileWidth - 4, 56);
      }
      const hit = this.add.rectangle(x, 632, tileWidth, 60, 0xffffff, 0)
        .setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { draw(true); heading.setText(`SKINS / ${skin.name.toUpperCase()}`); });
      hit.on('pointerout', () => { draw(false); heading.setText(`SKINS / ${equipped?.name.toUpperCase() ?? 'DEFAULT'}`); });
      hit.on('pointerup', () => {
        const dialog = openSkinSelection(this.currentCharacter.id, () => this.renderDetailPanel(false), skin.id);
        const cleanup = () => dialog.remove();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
        dialog.addEventListener('close', () => this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup), { once: true });
      });
      root.add([surface, icon, lockOverlay, hit]);
    });
  }

  private addStat(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    value: number,
    max: number,
    suffix = "",
  ): void {
    root.add(
      this.add.text(x, y, label, {
        color: "#4c5863",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 1,
      }),
    );
    const bar = this.add.graphics();
    bar.fillStyle(0xdce1e5, 1);
    bar.fillRect(x + 60, y + 5, 288, 9);
    bar.fillStyle(this.currentCharacter.accent, 1);
    bar.fillRect(x + 60, y + 5, 288 * Phaser.Math.Clamp(value / max, 0, 1), 9);
    root.add(bar);
    root.add(
      this.add
        .text(x + 412, y - 1, `${value}${suffix}`, {
          color: "#20262d",
          fontFamily: "Rajdhani",
          fontSize: "16px",
          fontStyle: "bold",
        })
        .setOrigin(1, 0),
    );
  }

  private addAbility(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    type: string,
    name: string,
    description: string,
    color: number,
  ): void {
    const panel = this.add.graphics();
    panel.fillStyle(0xe9edf1, 1);
    panel.fillRect(x, y, 412, 116);
    panel.fillStyle(color, 1);
    panel.fillRect(x, y, 5, 116);
    root.add(panel);
    root.add(
      this.add.text(x + 22, y + 14, type, {
        color: color === 0xffd23f ? "#9a7310" : "#1f8fbd",
        fontFamily: "Rajdhani",
        fontSize: "13px",
        fontStyle: "bold",
        letterSpacing: 1.7,
      }),
    );
    root.add(
      this.add.text(x + 22, y + 35, name, {
        color: "#242b32",
        fontFamily: "Rajdhani",
        fontSize: name.length > 18 ? "19px" : "22px",
        fontStyle: "bold",
        letterSpacing: 0.8,
      }),
    );
    root.add(
      new CombatKeywordText(this, description, {
        color: "#59646f",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "500",
        lineSpacing: 2,
        maxLines: 2,
        surface: "light",
        width: 366,
        x: x + 22,
        y: y + 68,
      }),
    );
  }

  private createTalentTreeButton(
    x: number,
    y: number,
    width: number,
    height: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    const label = this.add
      .text(width / 2, height / 2, "TALENT TREE", {
        color: "#26313a",
        fontFamily: "Rajdhani",
        fontSize: "19px",
        fontStyle: "bold",
        letterSpacing: 1.4,
      })
      .setOrigin(0.5);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    const redraw = (hovered: boolean): void => {
      surface.clear();
      surface.fillStyle(hovered ? 0xffffff : 0xf1f4f6, 1);
      surface.fillRect(0, 0, width, height);
      surface.lineStyle(1, hovered ? 0x35c5f2 : 0xaeb8c1, 1);
      surface.strokeRect(0.5, 0.5, width - 1, height - 1);
      surface.fillStyle(hovered ? 0x35c5f2 : this.currentCharacter.accent, 1);
      surface.fillRect(0, 0, 5, height);
    };
    redraw(false);
    hit.on("pointerover", () => redraw(true));
    hit.on("pointerout", () => redraw(false));
    hit.on("pointerup", () => {
      if (!canPreviewCharacterTalents(this.currentCharacter.id)) return;
      if (this.currentCharacter.id !== "snow-white" && this.currentCharacter.id !== "scarlet" && this.currentCharacter.id !== "rapunzel" && this.currentCharacter.id !== "nayuta" && this.currentCharacter.id !== "dorothy") { this.openTalentTree(); return; }
      const dialog = openLobbyTalentTree(this.currentCharacter.id);
      const cleanup = () => dialog.remove();
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      dialog.addEventListener('close', () => this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup), { once: true });
    });
    container.add([surface, label, hit]);
    return container;
  }

  private createDeployButton(
    x: number,
    y: number,
    width: number,
    height: number,
    enabled: boolean,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    const label = this.add
      .text(
        width / 2,
        height / 2,
        enabled
          ? "DEPLOY"
          : characterLockReason(this.currentCharacter.id) !== undefined
            ? "NOT YET DEPLOYABLE"
            : "RECRUIT IN SHOP",
        {
          color: enabled ? "#ffffff" : "#838c94",
          fontFamily: "Rajdhani",
          fontSize: enabled ? "30px" : "24px",
          fontStyle: "bold",
          letterSpacing: 1.3,
        },
      )
      .setOrigin(0.5);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0);
    if (enabled) {
      hit.setInteractive({ useHandCursor: true });
    }
    const redraw = (hovered: boolean): void => {
      surface.clear();
      surface.fillStyle(
        enabled ? (hovered ? 0x35c5f2 : 0x238eb8) : 0xd6dade,
        1,
      );
      surface.fillPoints(
        [
          new Phaser.Math.Vector2(7, 0),
          new Phaser.Math.Vector2(width, 0),
          new Phaser.Math.Vector2(width - 7, height),
          new Phaser.Math.Vector2(0, height),
        ],
        true,
      );
      surface.lineStyle(
        1,
        enabled ? (hovered ? 0xffffff : 0x1f8fe0) : 0xb6bdc4,
        1,
      );
      surface.strokePoints(
        [
          new Phaser.Math.Vector2(7, 0),
          new Phaser.Math.Vector2(width, 0),
          new Phaser.Math.Vector2(width - 7, height),
          new Phaser.Math.Vector2(0, height),
        ],
        true,
        true,
      );
    };
    redraw(false);
    hit.on("pointerover", () => redraw(true));
    hit.on("pointerout", () => redraw(false));
    hit.on("pointerup", () => this.deploy());
    container.add([surface, label, hit]);
    return container;
  }

  private createBackButton(): void {
    const x = 1636;
    const y = 102;
    const width = 218;
    const height = 60;
    const container = this.add.container(x, y).setDepth(30);
    const surface = this.add.graphics();
    const label = this.add
      .text(width / 2 + 10, height / 2, "BACK", {
        color: "#26303a",
        fontFamily: "Rajdhani",
        fontSize: "23px",
        fontStyle: "bold",
        letterSpacing: 1.2,
      })
      .setOrigin(0.5);
    const arrow = this.add.graphics();
    arrow.lineStyle(3, 0x35414b, 1);
    arrow.lineBetween(29, 30, 49, 18);
    arrow.lineBetween(29, 30, 49, 42);
    arrow.lineBetween(29, 30, 65, 30);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    const redraw = (hovered: boolean): void => {
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
    };
    redraw(false);
    hit.on("pointerover", () => redraw(true));
    hit.on("pointerout", () => redraw(false));
    hit.on("pointerup", () => this.goBack());
    container.add([surface, arrow, label, hit]);
  }

  private renderOperatorChip(): void {
    this.operatorChip?.destroy(true);
    const active =
      CHARACTERS.find(
        (character) => character.id === this.roster.selectedCharacterId,
      ) ?? CHARACTERS[0]!;
    const root = this.add.container(1368, 102).setDepth(30);
    this.operatorChip = root;
    const surface = this.add.graphics();
    surface.fillStyle(0xf7f9fa, 1);
    surface.fillPoints(
      [
        new Phaser.Math.Vector2(8, 0),
        new Phaser.Math.Vector2(246, 0),
        new Phaser.Math.Vector2(238, 60),
        new Phaser.Math.Vector2(0, 60),
      ],
      true,
    );
    surface.lineStyle(1, 0xb9c2ca, 1);
    surface.strokePoints(
      [
        new Phaser.Math.Vector2(8, 0),
        new Phaser.Math.Vector2(246, 0),
        new Phaser.Math.Vector2(238, 60),
        new Phaser.Math.Vector2(0, 60),
      ],
      true,
      true,
    );
    surface.fillStyle(active.accent, 1);
    surface.fillRect(0, 0, 5, 60);
    const portrait = this.add
      .image(36, 30, this.portraitKey(active))
      .setDisplaySize(48, 48);
    const slot = this.add.text(70, 10, "ACTIVE SLOT // 01", {
      color: "#87919b",
      fontFamily: "Rajdhani",
      fontSize: "12px",
      fontStyle: "bold",
      letterSpacing: 1.2,
    });
    const name = this.add.text(70, 28, active.name, {
      color: "#20262d",
      fontFamily: "Rajdhani",
      fontSize: active.name.length > 10 ? "18px" : "20px",
      fontStyle: "bold",
      letterSpacing: 0.7,
    });
    root.add([surface, portrait, slot, name]);
  }

  private openTalentTree(): void {
    if (!canPreviewCharacterTalents(this.currentCharacter.id)) return;
    if (this.talentTreeLayer !== undefined) return;
    this.activeTalentTree = "attack";
    this.sound.play(AUDIO.confirm, {
      volume: scaledSfxVolume(0.2, this.audioSettings),
    });
    this.renderTalentTreeModal(true);
  }

  private renderTalentTreeModal(animateEntrance = false): void {
    this.talentTreeLayer?.destroy(true);
    const root = this.add.container(0, 0).setDepth(200);
    this.talentTreeLayer = root;
    const talents = getCharacterTalents(
      this.currentCharacter.id,
      this.activeTalentTree,
    );

    const chrome = this.add.graphics();
    chrome.fillStyle(0x070b10, 0.82);
    chrome.fillRect(bleed.left, 0, bleed.width, HEIGHT);
    chrome.fillStyle(0xf4f7f9, 1);
    chrome.fillPoints(
      [
        new Phaser.Math.Vector2(118, 58),
        new Phaser.Math.Vector2(1802, 58),
        new Phaser.Math.Vector2(1802, 1000),
        new Phaser.Math.Vector2(1780, 1022),
        new Phaser.Math.Vector2(118, 1022),
      ],
      true,
    );
    chrome.fillStyle(0x0d141c, 1);
    chrome.fillRect(118, 58, 1684, 120);
    chrome.fillStyle(0x35c5f2, 1);
    chrome.fillRect(118, 175, 1684, 3);
    chrome.lineStyle(1, 0x6e7b86, 0.7);
    chrome.strokeRect(118.5, 58.5, 1683, 963);
    chrome.fillStyle(0xffffff, 1);
    chrome.fillRect(142, 204, 322, 760);
    chrome.lineStyle(1, 0xb8c2ca, 1);
    chrome.strokeRect(142.5, 204.5, 321, 759);
    chrome.fillStyle(0x101923, 1);
    chrome.fillRect(492, 280, 1284, 684);
    chrome.lineStyle(1, 0x4e6271, 0.65);
    chrome.strokeRect(492.5, 280.5, 1283, 683);
    root.add(chrome);

    root.add(
      this.add
        .rectangle(bleed.left, 0, bleed.width, HEIGHT, 0xffffff, 0)
        .setOrigin(0)
        .setInteractive(),
    );
    root.add(
      this.add.text(158, 85, "TALENT TREE", {
        color: "#f4f7f9",
        fontFamily: "Rajdhani",
        fontSize: "50px",
        fontStyle: "bold",
        letterSpacing: 2,
      }),
    );
    root.add(
      this.add.text(
        162,
        139,
        `OPERATIVE DEVELOPMENT // ${this.currentCharacter.name}`,
        {
          color: "#9eabb6",
          fontFamily: "Rajdhani",
          fontSize: "16px",
          fontStyle: "bold",
          letterSpacing: 2,
        },
      ),
    );

    const portrait = this.add
      .image(303, 356, this.portraitKey(this.currentCharacter))
      .setDisplaySize(260, 260);
    root.add(portrait);
    root.add(
      this.add.text(168, 506, this.currentCharacter.name, {
        color: "#202830",
        fontFamily: "Rajdhani",
        fontSize: this.currentCharacter.name.length > 10 ? "29px" : "35px",
        fontStyle: "bold",
        letterSpacing: 1.1,
        wordWrap: { width: 270 },
      }),
    );
    root.add(
      this.add.text(
        170,
        551,
        `${this.currentCharacter.squad} // ${this.currentCharacter.weaponTag}`,
        {
          color: "#6d7882",
          fontFamily: "Rajdhani",
          fontSize: "14px",
          fontStyle: "bold",
          letterSpacing: 1.3,
        },
      ),
    );
    const infoRule = this.add.graphics();
    infoRule.fillStyle(this.currentCharacter.accent, 1);
    infoRule.fillRect(168, 588, 72, 3);
    infoRule.fillStyle(0xaab5be, 0.35);
    infoRule.fillRect(240, 589, 196, 1);
    root.add(infoRule);
    root.add(
      this.add.text(168, 613, "TALENT DETAILS", {
        color: "#78838d",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "bold",
        letterSpacing: 1.7,
      }),
    );
    const detailName = this.add.text(168, 650, "SELECT A TALENT", {
      color: "#202830",
      fontFamily: "Rajdhani",
      fontSize: "25px",
      fontStyle: "bold",
      wordWrap: { width: 266 },
    });
    const detailText = this.add.text(
      168,
      700,
      "Move over a node to review its complete effect.",
      {
        color: "#56616b",
        fontFamily: "Rajdhani",
        fontSize: "16px",
        fontStyle: "500",
        lineSpacing: 5,
        wordWrap: { width: 266 },
      },
    );
    root.add([detailName, detailText]);

    TALENT_TREE_TABS.forEach((tab, index) => {
      const tabX = 492 + index * 428;
      const active = tab.id === this.activeTalentTree;
      const surface = this.add.graphics();
      const draw = (hovered: boolean): void => {
        surface.clear();
        surface.fillStyle(active ? 0x152a38 : hovered ? 0xe9eef2 : 0xffffff, 1);
        surface.fillRect(tabX, 204, 428, 58);
        surface.lineStyle(1, active ? 0x35c5f2 : 0xb8c2ca, 1);
        surface.strokeRect(tabX + 0.5, 204.5, 427, 57);
        if (active) {
          surface.fillStyle(0x35c5f2, 1);
          surface.fillRect(tabX, 258, 428, 4);
        }
      };
      draw(false);
      const label = this.add
        .text(tabX + 214, 233, tab.label, {
          color: active ? "#ffffff" : "#33404a",
          fontFamily: "Rajdhani",
          fontSize: "22px",
          fontStyle: "bold",
          letterSpacing: 1.5,
        })
        .setOrigin(0.5);
      const hit = this.add
        .rectangle(tabX, 204, 428, 58, 0xffffff, 0)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerover", () => draw(true));
      hit.on("pointerout", () => draw(false));
      hit.on("pointerup", () => {
        if (!active) {
          this.activeTalentTree = tab.id;
          this.sound.play(AUDIO.select, {
            volume: scaledSfxVolume(0.16, this.audioSettings),
          });
          this.renderTalentTreeModal();
        }
      });
      root.add([surface, label, hit]);
    });

    const regularTalents = talents.filter((talent) => !isMasteryTalent(talent));
    const mastery = talents.find(isMasteryTalent);
    const nodePositions = new Map<string, Phaser.Math.Vector2>();
    regularTalents.forEach((talent) => {
      const position = talentTreePosition(talent);
      nodePositions.set(
        talent.id,
        new Phaser.Math.Vector2(position.x, position.y),
      );
    });
    const edges = this.add.graphics();
    regularTalents.forEach((talent) => {
      const target = nodePositions.get(talent.id);
      if (target === undefined) return;
      talent.requires.forEach((requiredId) => {
        const source = nodePositions.get(requiredId);
        if (source === undefined) return;
        const requiredTalent = regularTalents.find(
          (entry) => entry.id === requiredId,
        );
        const mainPath =
          requiredTalent !== undefined &&
          isMainProgressionTalent(requiredTalent) &&
          isMainProgressionTalent(talent);
        edges.lineStyle(3, mainPath ? 0xffd23f : 0x35c5f2, 0.72);
        const sourceX = source.x + TALENT_NODE_WIDTH / 2;
        const sourceY = source.y + TALENT_NODE_HEIGHT / 2;
        const targetX = target.x + TALENT_NODE_WIDTH / 2;
        const targetY = target.y + TALENT_NODE_HEIGHT / 2;
        if (sourceY === targetY) {
          edges.lineBetween(sourceX, sourceY, targetX, targetY);
        } else {
          const middleY = (sourceY + targetY) / 2;
          edges.lineBetween(sourceX, sourceY, sourceX, middleY);
          edges.lineBetween(sourceX, middleY, targetX, middleY);
          edges.lineBetween(targetX, middleY, targetX, targetY);
        }
      });
    });
    root.add(edges);
    regularTalents.forEach((talent) => {
      const position = nodePositions.get(talent.id);
      if (position !== undefined) {
        root.add(
          this.createTalentNode(
            talent,
            position.x,
            position.y,
            detailName,
            detailText,
          ),
        );
      }
    });
    if (mastery !== undefined) {
      const position = talentTreePosition(mastery);
      root.add(
        this.createTalentMasteryPreview(
          mastery,
          position.x,
          position.y,
          detailName,
          detailText,
        ),
      );
    }

    const closeSurface = this.add.graphics();
    const closeHit = this.add
      .rectangle(1708, 87, 58, 58, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    const drawClose = (hovered: boolean): void => {
      closeSurface.clear();
      closeSurface.fillStyle(hovered ? 0x263541 : 0x17212b, 1);
      closeSurface.fillRect(1708, 87, 58, 58);
      closeSurface.lineStyle(1, hovered ? 0x35c5f2 : 0x53616d, 1);
      closeSurface.strokeRect(1708.5, 87.5, 57, 57);
      closeSurface.lineStyle(3, 0xe9f0f4, 1);
      closeSurface.lineBetween(1727, 106, 1747, 126);
      closeSurface.lineBetween(1747, 106, 1727, 126);
    };
    drawClose(false);
    closeHit.on("pointerover", () => drawClose(true));
    closeHit.on("pointerout", () => drawClose(false));
    closeHit.on("pointerup", () => this.closeTalentTree());
    root.add([closeSurface, closeHit]);

    if (animateEntrance) {
      root.setAlpha(0);
      this.tweens.add({
        alpha: 1,
        duration: 180,
        ease: "Cubic.Out",
        targets: root,
      });
    }
  }

  private createTalentNode(
    talent: TalentDefinition,
    x: number,
    y: number,
    detailName: Phaser.GameObjects.Text,
    detailText: Phaser.GameObjects.Text,
  ): Phaser.GameObjects.Container {
    const width = TALENT_NODE_WIDTH;
    const height = TALENT_NODE_HEIGHT;
    const placeholder = talent.name === "Placeholder";
    const mainPath = isMainProgressionTalent(talent);
    const accent = mainPath ? 0xffd23f : 0x35c5f2;
    const root = this.add.container(0, 0);
    const surface = this.add.graphics();
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface.fillStyle(
        placeholder
          ? 0x17212a
          : mainPath
            ? hovered
              ? 0x3b3824
              : 0x29281e
            : hovered
              ? 0x294553
              : 0x172b36,
        1,
      );
      surface.fillRect(x, y, width, height);
      surface.lineStyle(hovered ? 2 : 1, placeholder ? 0x46535d : accent, 1);
      surface.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
      surface.fillStyle(placeholder ? 0x68747d : accent, 1);
      surface.fillRect(x, y, 6, height);
    };
    draw(false);
    const name = this.add.text(x + 24, y + 18, talent.name.toUpperCase(), {
      color: placeholder ? "#8c969e" : mainPath ? "#ffd23f" : "#80dcf7",
      fontFamily: "Rajdhani",
      fontSize: talent.name.length > 23 ? "20px" : "24px",
      fontStyle: "bold",
      wordWrap: { width: 304 },
    });
    const description = this.add.text(
      x + 24,
      y + 58,
      talent.desc || "Talent slot reserved for future design.",
      {
        color: placeholder ? "#717d86" : "#aebbc4",
        fontFamily: "Rajdhani",
        fontSize: "16px",
        fontStyle: "500",
        lineSpacing: 3,
        wordWrap: { width: 304 },
      },
    );
    const level = this.add
      .text(x + width - 20, y + height - 22, `MAX ${talent.max}`, {
        color: placeholder ? "#69757e" : mainPath ? "#ffd23f" : "#35c5f2",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "bold",
        letterSpacing: 1.2,
      })
      .setOrigin(1, 0.5);
    const hit = this.add
      .rectangle(x, y, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => {
      draw(true);
      detailName.setText(talent.name.toUpperCase());
      detailText.setText(talent.tooltip);
    });
    hit.on("pointerout", () => draw(false));
    root.add([surface, name, description, level, hit]);
    return root;
  }

  private createTalentMasteryPreview(
    talent: TalentDefinition,
    x: number,
    y: number,
    detailName: Phaser.GameObjects.Text,
    detailText: Phaser.GameObjects.Text,
  ): Phaser.GameObjects.Container {
    const width = TALENT_NODE_WIDTH;
    const height = TALENT_MASTERY_HEIGHT;
    const root = this.add.container(0, 0);
    const surface = this.add.graphics();
    surface
      .fillStyle(0x222a30, 1)
      .fillRect(x, y, width, height)
      .fillStyle(0x343e45, 1)
      .fillRect(x + 6, y, width - 6, 48)
      .fillStyle(0x1a2126, 1)
      .fillRect(x + 6, y + height - 58, width - 6, 58)
      .lineStyle(2, 0x73808a, 1)
      .strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
      .fillStyle(0x7a858d, 1)
      .fillRect(x, y, 6, height)
      .fillRect(x + 6, y + 47, width - 6, 2)
      .lineStyle(1, 0x68757e, 1)
      .lineBetween(x + 6, y + height - 58, x + width, y + height - 58)
      .strokeRect(x + width - 108.5, y + height - 57.5, 108, 57);
    const label = this.add.text(x + 24, y + 11, "MASTERY", {
      color: "#e2e7ea",
      fontFamily: "Rajdhani",
      fontSize: "23px",
      fontStyle: "bold",
      letterSpacing: 2.6,
    });
    const capstone = this.add
      .text(x + width - 18, y + 25, "AUTOMATIC CAPSTONE", {
        color: "#a8b2b8",
        fontFamily: "Rajdhani",
        fontSize: "11px",
        fontStyle: "bold",
        letterSpacing: 1.4,
      })
      .setOrigin(1, 0.5);
    const progress = this.add
      .text(x + width - 54, y + height - 29, "0 / 7", {
        color: "#d2d9dd",
        fontFamily: "Rajdhani",
        fontSize: "29px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const name = this.add.text(x + 24, y + 62, talent.name.toUpperCase(), {
      color: "#e0e5e8",
      fontFamily: "Rajdhani",
      fontSize: talent.name.length > 23 ? "21px" : "27px",
      fontStyle: "bold",
      wordWrap: { width: width - 48 },
    });
    const description = this.add.text(x + 24, y + 102, talent.desc, {
      color: "#a8b2b8",
      fontFamily: "Rajdhani",
      fontSize: "15px",
      fontStyle: "500",
      wordWrap: { width: width - 48 },
    });
    const status = this.add
      .text(x + 24, y + height - 29, "AUTO-UNLOCKS AT 7 / 7", {
        color: "#b6c0c6",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "bold",
        letterSpacing: 1.1,
      })
      .setOrigin(0, 0.5);
    const hit = this.add
      .rectangle(x, y, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: false });
    hit.on("pointerover", () => {
      detailName.setText(talent.name.toUpperCase());
      detailText.setText(
        `${talent.tooltip}\n\nAutomatically activates when all seven other talents in this category are owned. No skill point required.`,
      );
    });
    root.add([
      surface,
      label,
      capstone,
      progress,
      name,
      description,
      status,
      hit,
    ]);
    return root;
  }

  private closeTalentTree(): void {
    if (this.talentTreeLayer === undefined) return;
    gameAudio.playUi(this, "back");
    this.talentTreeLayer.destroy(true);
    this.talentTreeLayer = undefined;
  }

  private deploy(): void {
    if (!this.isUnlocked(this.currentCharacter)) {
      return;
    }
    saveSelectedCharacter(this.currentCharacter.id);
    this.sound.play(AUDIO.confirm, {
      volume: scaledSfxVolume(0.25, this.audioSettings),
    });
    this.input.enabled = false;
    const transitionProfile = nextNikkeTransitionProfile();
    playHexWipeCover(
      this,
      () => {
        this.scene.launch("stage-select", {
          characterId: this.currentCharacter.id,
          previousScene: "character-select",
          revealTransition: true,
          transitionProfile,
        });
      },
      transitionProfile,
    );
  }

  private goBack(): void {
    if (!this.input.enabled) {
      return;
    }
    gameAudio.playUi(this, "back");
    this.input.enabled = false;
    const transitionProfile = nextNikkeTransitionProfile();
    playHexWipeCover(
      this,
      () => {
        this.scene.launch("main-menu", {
          previousScene: "character-select",
          revealTransition: true,
          transitionProfile,
        });
      },
      transitionProfile,
    );
  }

  private isUnlocked(character: CharacterDefinition): boolean {
    return this.roster.unlockedCharacterIds.includes(character.id);
  }

  private portraitKey(character: CharacterDefinition): string {
    return `character-select-${character.id}-portrait`;
  }

  private burstKey(character: CharacterDefinition): string {
    return `character-select-${character.id}-burst`;
  }
}

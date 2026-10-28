import { cores } from "../ui/cores";
import { characterSkins } from '../profile/Skins';
import { createSkinShowroom } from '../ui/SkinShowroom';
import Phaser from "phaser";

import { FEATURES } from "../../features";
import { gameAudio, preloadLobbyAudio } from "../audio/GameAudio";
import { bindButtonInteraction } from "../ui/interaction/ButtonInteraction";
import {
  formatPermanentUpgradeBonus,
  PERMANENT_UPGRADES,
  permanentUpgradeCost,
  type PermanentUpgradeDefinition,
  type PermanentUpgradeId,
  type PermanentUpgradeLevels,
} from "../profile/PermanentUpgrades";
import {
  CHARACTERS,
  characterBurstPath,
  STARTER_CHARACTER_ID,
  type CharacterDefinition,
  loadRosterState,
  purchasePermanentUpgrade,
  unlockCharacter,
  unlockNipmh,
} from "../profile/CharacterRoster";
import {
  nextNikkeTransitionProfile,
  playHexWipeCover,
  playHexWipeReveal,
  type HexWipeProfile,
} from "../ui/transitions/HexWipeTransition";
import { CombatKeywordText } from "../ui/text/CombatKeywordText";
import { applyAchievementProgress } from "../profile/AchievementProgress";
import { RunState } from "../gameplay/model/RunState";
import { openLobbyTalentTree } from "../ui/LobbyTalentTree";
import { RunTalentTree } from "../gameplay/ui/RunTalentTree";
import {
  NIPMH_CATALOG,
  nipmhTextureKey,
  nipmhUnlockCost,
  preloadNipmhAssets,
  type NipmhCategory,
  type NipmhDefinition,
  type NipmhId,
} from "../features/nipmh";

const WIDTH = 1920;
const HEIGHT = 1080;
const AUDIO = {
  confirm: "shop-confirm",
  select: "shop-select",
} as const;

type ShopTab = "skins" | "characters" | "nipmhs" | "upgrades";
type NipmhShopFilter = "all" | "locked" | NipmhCategory;
type NipmhShopSort = "archive" | "cost-asc" | "cost-desc" | "name";

const NIPMH_SORT_OPTIONS: readonly {
  readonly id: NipmhShopSort;
  readonly label: string;
}[] = [
  { id: "archive", label: "ARCHIVE ORDER" },
  { id: "name", label: "NAME A-Z" },
  { id: "cost-asc", label: "UNLOCK COST // LOW" },
  { id: "cost-desc", label: "UNLOCK COST // HIGH" },
];

const NIPMH_ACCENTS: Readonly<Record<NipmhCategory, number>> = {
  assault: 0xe15b5b,
  control: 0x35c5f2,
  sustain: 0x63c68a,
};

interface ShopSceneData {
  readonly previousScene?: string;
  readonly revealTransition?: boolean;
  readonly transitionProfile?: HexWipeProfile;
}

export class ShopScene extends Phaser.Scene {
  private skinShowroom?: { dispose: () => void };
  private activeTab: ShopTab = "characters";
  private contentLayer?: Phaser.GameObjects.Container;
  private coreValueText?: Phaser.GameObjects.Text;
  private leaving = false;
  private message = "";
  private nipmhFilter: NipmhShopFilter = "all";
  private nipmhPage = 0;
  private nipmhSort: NipmhShopSort = "archive";
  private nipmhSortOpen = false;
  private previousScene?: string;
  private revealTransition = false;
  private selectedCharacterId = STARTER_CHARACTER_ID;
  private selectedNipmhId: NipmhId = NIPMH_CATALOG[0]!.id;
  private selectedUpgradeId: PermanentUpgradeId = PERMANENT_UPGRADES[0]!.id;
  private readonly tabRedraws: Array<() => void> = [];
  private talentPreview?: RunTalentTree;
  private currentTalentPreview?: HTMLDialogElement;
  private transitionProfile?: HexWipeProfile;

  public constructor() {
    super("shop");
  }

  public init(data: ShopSceneData = {}): void {
    this.contentLayer = undefined;
    this.coreValueText = undefined;
    this.tabRedraws.length = 0;
    this.previousScene = data.previousScene;
    this.revealTransition = data.revealTransition ?? false;
    this.transitionProfile = data.transitionProfile;
    this.leaving = false;
    this.message = "";
    if (this.activeTab === "upgrades") this.activeTab = "characters";
    if (this.activeTab === "nipmhs" && !FEATURES.nipmh) this.activeTab = "characters";
  }

  public preload(): void {
    CHARACTERS.forEach((character) => {
      this.load.image(this.portraitKey(character), character.portraitPath);
      this.load.image(
        this.burstKey(character),
        characterBurstPath(character.id),
      );
    });
    preloadNipmhAssets(this);
    this.load.audio(AUDIO.select, "assets/audio/ui/select.wav");
    this.load.audio(AUDIO.confirm, "assets/audio/ui/confirm.wav");
    preloadLobbyAudio(this);
  }

  public create(): void {
    this.createBackdrop();
    this.createHeader();
    this.createTabs();
    this.createBackButton();
    this.renderContent();
    gameAudio.playLobby(this);
    const onEscape = (event: KeyboardEvent): void => {
      // DOM dialogs own their close gesture, including queued/repeated Escape events.
      if (event.defaultPrevented || event.repeat ||
          (event.target instanceof Element && event.target.closest('.st-menu'))) return;
      if (this.currentTalentPreview?.open) {
        this.currentTalentPreview.close();
      } else if (this.talentPreview?.isOpen === true) {
        this.talentPreview.close();
      } else {
        this.leave();
      }
    };
    this.input.keyboard?.on("keydown-ESC", onEscape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown-ESC", onEscape);
      this.currentTalentPreview?.close(); this.currentTalentPreview?.remove(); this.currentTalentPreview = undefined;
      this.skinShowroom?.dispose(); this.skinShowroom = undefined;
      this.talentPreview?.destroy();
      this.talentPreview = undefined;
    });

    if (this.revealTransition) {
      playHexWipeReveal(this, this.transitionProfile ?? "CORE EXCHANGE");
      if (this.previousScene !== undefined) {
        this.scene.stop(this.previousScene);
      }
    } else {
      this.cameras.main.fadeIn(260, 8, 13, 18);
    }
  }

  private createBackdrop(): void {
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0xe9edf1).setOrigin(0);
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x81909c, 0.1);
    for (let x = -360; x < WIDTH + 360; x += 190) {
      grid.lineBetween(x, 138, x + 420, HEIGHT);
    }
    grid.fillStyle(0x202832, 1).fillRect(0, 0, WIDTH, 136);
    grid.fillStyle(0xe8392e, 1).fillRect(0, 132, 1180, 4);
    grid.fillStyle(0x35c5f2, 1).fillRect(1180, 132, WIDTH - 1180, 4);
  }

  private createHeader(): void {
    this.add.text(56, 36, "ARK PROCUREMENT // PERMANENT ACCESS", {
      color: "#8e9aa7",
      fontFamily: "Rajdhani",
      fontSize: "18px",
      fontStyle: "bold",
      letterSpacing: 2.2,
    });
    this.add.text(54, 64, "CORE EXCHANGE", {
      color: "#f7f9fb",
      fontFamily: "Rajdhani",
      fontSize: "45px",
      fontStyle: "bold",
      letterSpacing: 2.4,
    });
    this.add.text(430, 80, FEATURES.nipmh ? "OPERATORS, SKINS AND SUPPLY AUTHORIZATIONS" : "UNLOCK OPERATORS AND SKINS", {
      color: "#aeb7c1",
      fontFamily: "Rajdhani",
      fontSize: "19px",
      fontStyle: "bold",
      letterSpacing: 1.2,
    });

    const corePanel = this.add.graphics();
    corePanel.fillStyle(0x111820, 1).fillRect(1538, 39, 326, 66);
    corePanel.lineStyle(1, 0x5e6a76, 1).strokeRect(1538.5, 39.5, 325, 65);
    corePanel.fillStyle(0xe8392e, 1).fillCircle(1575, 72, 10);
    corePanel.lineStyle(1, 0xff8179, 1).strokeCircle(1575, 72, 15);
    this.coreValueText = this.add
      .text(1605, 72, "0", {
        color: "#f7f9fb",
        fontFamily: "Rajdhani",
        fontSize: "32px",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.add
      .text(1838, 73, "RAPTURE CORES", {
        color: "#8f99a5",
        fontFamily: "Rajdhani",
        fontSize: "13px",
        fontStyle: "bold",
        letterSpacing: 1.4,
      })
      .setOrigin(1, 0.5);
  }

  private createTabs(): void {
    this.tabRedraws.length = 0;
    this.createTabButton(58, 158, 300, "characters", "CHARACTERS");
    this.createTabButton(374, 158, 300, "skins", "SKINS");
    if (FEATURES.nipmh) this.createTabButton(690, 158, 300, "nipmhs", "NIPMHS");
  }

  private createTabButton(
    x: number,
    y: number,
    width: number,
    tab: ShopTab,
    label: string,
  ): void {
    const surface = this.add.graphics();
    const text = this.add
      .text(x + width / 2, y + 28, label, {
        color: "#252b34",
        fontFamily: "Rajdhani",
        fontSize: "23px",
        fontStyle: "bold",
        letterSpacing: 1.4,
      })
      .setOrigin(0.5);
    const redraw = (): void => {
      const selected = this.activeTab === tab;
      surface.clear();
      surface
        .fillStyle(selected ? 0x35c5f2 : 0xd8dde2, 1)
        .fillRect(x, y, width, 56);
      surface
        .lineStyle(1, selected ? 0x168db3 : 0xaeb7c0, 1)
        .strokeRect(x + 0.5, y + 0.5, width - 1, 55);
      if (selected) {
        surface.fillStyle(0x202832, 1).fillRect(x, y + 52, width, 4);
      }
    };
    this.tabRedraws.push(redraw);
    redraw();
    const hit = this.add
      .rectangle(x, y, width, 56, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerup", () => {
      if (this.activeTab === tab) {
        return;
      }
      this.activeTab = tab;
      this.message = "";
      this.nipmhSortOpen = false;
      this.sound.play(AUDIO.select, { volume: 0.18 });
      this.tabRedraws.forEach((redrawTab) => redrawTab());
      this.renderContent();
    });
    void text;
  }

  private createBackButton(): void {
    const x = 1640;
    const y = 158;
    const width = 208;
    const height = 58;
    const container = this.add.container(x, y).setDepth(30);
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
      surface.lineStyle(3, hovered ? 0x1f8fe0 : 0x35414b, 1);
      surface.lineBetween(37, 29, 58, 29);
      surface.lineBetween(37, 29, 47, 19);
      surface.lineBetween(37, 29, 47, 39);
    };
    redraw(false);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0);
    bindButtonInteraction(hit, {
      draw: redraw,
      onActivate: () => this.leave(),
    });
    container.add([surface, label, hit]);
  }

  private renderContent(): void {
    this.skinShowroom?.dispose(); this.skinShowroom = undefined;
    this.contentLayer?.destroy(true);
    this.contentLayer = this.add.container(0, 0);
    const state = loadRosterState();
    this.coreValueText?.setText(`${state.pristineCores}`);
    if (this.activeTab === "characters") {
      this.renderCharacters(state.unlockedCharacterIds);
    } else if (this.activeTab === "skins") {
      this.renderSkins();
    } else if (this.activeTab === "upgrades") {
      this.renderUpgrades(state.permanentUpgradeLevels);
    } else {
      this.renderNipmhs(state.unlockedNipmhIds);
    }
  }

  private renderSkins(): void {
    const state = loadRosterState();
    CHARACTERS.forEach((character, index) => {
      this.contentLayer!.add(this.createCharacterCard(character, 58 + index % 4 * 274, 244 + Math.floor(index / 4) * 224,
        state.unlockedCharacterIds.includes(character.id), character.id === this.selectedCharacterId));
    });
    this.contentLayer!.add(this.add.text(58, 940, 'SELECT A CHARACTER TO BROWSE THEIR APPEARANCES', { fontFamily: 'Rajdhani', fontSize: '24px', fontStyle: 'bold', color: '#37657c' }));
    const showroom = createSkinShowroom(this.selectedCharacterId, 'shop', () => {
      this.coreValueText?.setText(String(loadRosterState().pristineCores));
      this.sound.play(AUDIO.confirm, { volume: .2 });
    });
    const host = document.createElement('div'); host.className = 'shop-skin-showroom';
    host.style.width = '674px'; host.style.height = '744px'; host.append(showroom.element); document.body.append(host);
    const canvas = this.game.canvas;
    const position = () => {
      const bounds = canvas.getBoundingClientRect(), scale = bounds.width / WIDTH;
      host.style.left = `${bounds.left + 1188 * scale}px`; host.style.top = `${bounds.top + 244 * scale}px`;
      host.style.transform = `scale(${scale})`;
    };
    const observer = new ResizeObserver(position); observer.observe(canvas); window.addEventListener('resize', position); position();
    this.skinShowroom = { dispose: () => { observer.disconnect(); window.removeEventListener('resize', position); showroom.dispose(); host.remove(); } };
  }

  private renderCharacters(unlockedIds: readonly string[]): void {
    CHARACTERS.forEach((character, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      this.contentLayer?.add(
        this.createCharacterCard(
          character,
          58 + column * 274,
          244 + row * 224,
          unlockedIds.includes(character.id),
          character.id === this.selectedCharacterId,
        ),
      );
    });
    const selected =
      CHARACTERS.find((entry) => entry.id === this.selectedCharacterId) ??
      CHARACTERS[0]!;
    this.contentLayer?.add(
      this.createCharacterDetail(selected, unlockedIds.includes(selected.id)),
    );
  }

  private createCharacterCard(
    character: CharacterDefinition,
    x: number,
    y: number,
    unlocked: boolean,
    selected: boolean,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    surface
      .fillStyle(selected ? 0xf7f9fb : 0xdde2e6, 0.98)
      .fillRect(0, 0, 252, 198);
    surface.fillStyle(0x151c24, 1).fillRect(6, 0, 112, 198);
    surface
      .lineStyle(
        1,
        selected ? character.accent : 0x9da8b2,
        selected ? 0.8 : 0.55,
      )
      .lineBetween(118.5, 0, 118.5, 198);
    surface
      .lineStyle(selected ? 3 : 1, selected ? character.accent : 0xaab3bc, 1)
      .strokeRect(0.5, 0.5, 251, 197);
    surface
      .fillStyle(character.accent, selected ? 1 : 0.7)
      .fillRect(0, 0, 6, 198);
    surface
      .fillStyle(selected ? 0x252f39 : 0x47535e, 1)
      .fillRect(118, 149, 134, 49);
    surface
      .fillStyle(character.accent, selected ? 1 : 0.7)
      .fillRect(118, 149, 134, 3);
    const burstArt = this.fitImageWithin(
      this.add.image(62, 99, this.burstKey(character)),
      110,
      194,
    ).setAlpha(unlocked ? 1 : 0.42);
    const eyebrow = this.add.text(130, 16, "NIKKE // OPERATOR", {
      color: selected ? "#758390" : "#6f7a84",
      fontFamily: "Rajdhani",
      fontSize: "10px",
      fontStyle: "bold",
      letterSpacing: 0.7,
    });
    const name = this.add.text(128, 35, character.name, {
      color: "#252b34",
      fontFamily: "Rajdhani",
      fontSize: character.name.length > 9 ? "18px" : "20px",
      fontStyle: "bold",
      wordWrap: { width: 116 },
    });
    const divider = this.add.graphics();
    divider
      .fillStyle(character.accent, selected ? 0.95 : 0.65)
      .fillRect(130, 66, 30, 2);
    divider.fillStyle(0x9ca7b0, 0.42).fillRect(164, 66, 76, 1);
    const weaponLabel = this.add.text(130, 80, "WEAPON", {
      color: "#66717c",
      fontFamily: "Rajdhani",
      fontSize: "10px",
      fontStyle: "bold",
      letterSpacing: 0.8,
    });
    const weapon = this.add.text(178, 78, character.weaponTag, {
      color: "#34404b",
      fontFamily: "Rajdhani",
      fontSize: "14px",
      fontStyle: "bold",
    });
    const squadLabel = this.add.text(130, 108, "SQUAD", {
      color: "#66717c",
      fontFamily: "Rajdhani",
      fontSize: "10px",
      fontStyle: "bold",
      letterSpacing: 0.8,
    });
    const squad = this.add.text(169, 106, character.squad, {
      color: "#34404b",
      fontFamily: "Rajdhani",
      fontSize: character.squad.length > 9 ? "12px" : "14px",
      fontStyle: "bold",
    });
    const statusMark = this.add.text(130, 160, unlocked ? "✓" : "◆", {
      color: unlocked ? "#69d9fb" : "#ff8179",
      fontFamily: "Rajdhani",
      fontSize: "15px",
      fontStyle: "bold",
    });
    const status = this.add.text(
      150,
      158,
      unlocked ? "RECRUITED" : cores(character.unlockCost),
      {
        color: unlocked ? "#f7f9fb" : "#fff0ef",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
      },
    );
    const statusDetail = this.add.text(
      150,
      177,
      unlocked ? "ACTIVE ROSTER" : "RECRUIT COST",
      {
        color: unlocked ? "#9aa9b7" : "#cda6a3",
        fontFamily: "Rajdhani",
        fontSize: "9px",
        fontStyle: "bold",
        letterSpacing: 0.7,
      },
    );
    if (this.activeTab === 'skins') {
      const count = characterSkins(character.id).filter(skin => skin.cost > 0).length;
      status.setText(unlocked ? `${count} SKINS` : 'COMING SOON');
      statusDetail.setText('VIEW APPEARANCES');
    }
    const hit = this.add
      .rectangle(0, 0, 252, 198, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerup", () => {
      this.selectedCharacterId = character.id;
      this.message = "";
      this.sound.play(AUDIO.select, { volume: 0.14 });
      this.renderContent();
    });
    container.add([
      surface,
      burstArt,
      eyebrow,
      name,
      divider,
      weaponLabel,
      weapon,
      squadLabel,
      squad,
      statusMark,
      status,
      statusDetail,
      hit,
    ]);
    return container;
  }

  private createCharacterDetail(
    character: CharacterDefinition,
    unlocked: boolean,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(1188, 244);
    const panel = this.add.graphics();
    panel.fillStyle(0x202832, 0.98).fillRect(0, 0, 674, 646);
    panel.lineStyle(1, 0x65717d, 1).strokeRect(0.5, 0.5, 673, 645);
    panel.fillStyle(character.accent, 1).fillRect(0, 0, 674, 6);
    const portraitFrame = this.add.graphics();
    portraitFrame.fillStyle(0x151c24, 1).fillRect(28, 28, 214, 214);
    portraitFrame
      .lineStyle(1, character.accent, 0.8)
      .strokeRect(28.5, 28.5, 213, 213);
    const portrait = this.fitImageWithin(
      this.add.image(135, 135, this.portraitKey(character)),
      202,
      202,
    ).setAlpha(unlocked ? 1 : 0.58);
    const eyebrow = this.add.text(
      270,
      35,
      `${character.squad} // ${character.weapon}`,
      {
        color: "#69d9fb",
        fontFamily: "Rajdhani",
        fontSize: "16px",
        fontStyle: "bold",
        letterSpacing: 1,
      },
    );
    const name = this.add.text(268, 62, character.name, {
      color: "#f7f9fb",
      fontFamily: "Rajdhani",
      fontSize: character.name.length > 10 ? "35px" : "40px",
      fontStyle: "bold",
    });
    const description = this.add.text(270, 115, character.description, {
      color: "#c4cbd2",
      fontFamily: "Rajdhani",
      fontSize: "17px",
      fontStyle: "bold",
      lineSpacing: 3,
      wordWrap: { width: 366 },
    });
    const statStrip = this.createCharacterStatStrip(character, 270, 194);
    const skillLabel = this.add.text(28, 260, "COMBAT KIT // FULL LOADOUT", {
      color: "#8e9aa7",
      fontFamily: "Rajdhani",
      fontSize: "15px",
      fontStyle: "bold",
      letterSpacing: 1.6,
    });
    const skillTreePreview = this.createSkillTreePreviewButton(
      character,
      424,
      250,
    );
    const kitEntries = [
      {
        description: character.basicAttackDescription,
        label: "BASIC ATTACK",
        type: "ATK",
      },
      {
        description: character.specialDescription,
        label: character.specialName,
        type: "SKILL",
      },
      ...(character.skill2Name !== undefined &&
      character.skill2Description !== undefined
        ? [
            {
              description: character.skill2Description,
              label: character.skill2Name,
              type: "SKILL 2",
            },
          ]
        : []),
      {
        description: character.burstDescription,
        label: character.burstName,
        type: "BURST",
      },
    ];
    const kitRows = kitEntries.map((entry, index) =>
      this.createKitRow(
        entry.type,
        entry.label,
        entry.description,
        28,
        290 + index * 63,
        character.accent,
      ),
    );
    const action = this.createPurchaseButton(
      483,
      600,
      unlocked,
      character.unlockCost,
      () => {
        if (unlockCharacter(character.id)) {
          applyAchievementProgress({
            shopUnlockedCharacterId: character.id,
          });
          this.message = `${character.name} RECRUITED`;
          this.sound.play(AUDIO.confirm, { volume: 0.24 });
          this.renderContent();
        }
      },
    );
    const message = this.add
      .text(28, 600, this.message, {
        color: "#78e89b",
        fontFamily: "Rajdhani",
        fontSize: "16px",
        fontStyle: "bold",
        wordWrap: { width: 264 },
      })
      .setOrigin(0, 0.5);
    container.add([
      panel,
      portraitFrame,
      portrait,
      eyebrow,
      name,
      description,
      statStrip,
      skillLabel,
      skillTreePreview,
      ...kitRows,
      action,
      message,
    ]);
    return container;
  }

  private createSkillTreePreviewButton(
    character: CharacterDefinition,
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const width = 222;
    const height = 34;
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    const label = this.add
      .text(width / 2, height / 2, "PREVIEW SKILL TREE", {
        color: "#dce4ea",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "bold",
        letterSpacing: 1,
      })
      .setOrigin(0.5);
    const redraw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(hovered ? 0x304553 : 0x17232d, 1)
        .fillRect(0, 0, width, height);
      surface
        .lineStyle(1, hovered ? 0x69d9fb : character.accent, 1)
        .strokeRect(0.5, 0.5, width - 1, height - 1);
    };
    redraw(false);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0);
    bindButtonInteraction(hit, {
      draw: redraw,
      onActivate: () => this.openTalentPreview(character),
    });
    container.add([surface, label, hit]);
    return container;
  }

  private openTalentPreview(character: CharacterDefinition): void {
    this.talentPreview?.destroy();
    this.currentTalentPreview?.close(); this.currentTalentPreview?.remove();
    if (character.id === 'snow-white' || character.id === 'scarlet' || character.id === 'rapunzel') {
      const dialog = openLobbyTalentTree(character.id);
      this.currentTalentPreview = dialog;
      const inputEnabled = this.input.enabled;
      const keyboard = this.input.keyboard;
      const keyboardEnabled = keyboard?.enabled;
      this.input.enabled = false;
      if (keyboard) keyboard.enabled = false;
      dialog.addEventListener('close', () => {
        dialog.remove();
        if (this.currentTalentPreview !== dialog) return;
        this.currentTalentPreview = undefined;
        this.input.enabled = inputEnabled;
        if (keyboard) { keyboard.resetKeys(); keyboard.enabled = keyboardEnabled ?? true; }
      }, { once: true });
      this.sound.play(AUDIO.select, { volume: 0.18 });
      return;
    }
    const previewRun = new RunState(false, 1, false);
    this.talentPreview = new RunTalentTree(
      this,
      character,
      previewRun,
      () => {
        const preview = this.talentPreview;
        this.talentPreview = undefined;
        preview?.destroy();
      },
      () => undefined,
      {
        portraitKey: this.portraitKey(character),
        previewOnly: true,
      },
    );
    this.sound.play(AUDIO.select, { volume: 0.18 });
    this.talentPreview.open();
  }

  private renderUpgrades(levels: PermanentUpgradeLevels): void {
    PERMANENT_UPGRADES.forEach((upgrade, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      this.contentLayer?.add(
        this.createUpgradeCard(
          upgrade,
          58 + column * 360,
          250 + row * 216,
          levels[upgrade.id],
          upgrade.id === this.selectedUpgradeId,
        ),
      );
    });
    this.contentLayer?.add(
      this.add.text(58, 724, "PERMANENT CALIBRATION", {
        color: "#252b34",
        fontFamily: "Rajdhani",
        fontSize: "28px",
        fontStyle: "bold",
        letterSpacing: 1.2,
      }),
    );
    this.contentLayer?.add(
      this.add.text(
        58,
        770,
        "Core calibrations apply to every operator and every deployment.\nUpgrade levels are stored in the local profile automatically.",
        {
          color: "#596573",
          fontFamily: "Rajdhani",
          fontSize: "21px",
          fontStyle: "bold",
          lineSpacing: 7,
        },
      ),
    );
    const selected =
      PERMANENT_UPGRADES.find((entry) => entry.id === this.selectedUpgradeId) ??
      PERMANENT_UPGRADES[0]!;
    this.contentLayer?.add(
      this.createUpgradeDetail(selected, levels[selected.id]),
    );
  }

  private createUpgradeCard(
    upgrade: PermanentUpgradeDefinition,
    x: number,
    y: number,
    level: number,
    selected: boolean,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    surface
      .fillStyle(selected ? 0xf7f9fb : 0xdde2e6, 1)
      .fillRect(0, 0, 330, 190);
    surface
      .lineStyle(selected ? 3 : 1, selected ? upgrade.accent : 0xaab3bc, 1)
      .strokeRect(0.5, 0.5, 329, 189);
    surface.fillStyle(0x202832, 1).fillRect(0, 0, 118, 190);
    surface.fillStyle(upgrade.accent, 1).fillRect(0, 0, 6, 190);
    const icon = this.add
      .text(59, 82, upgrade.glyph, {
        color: `#${upgrade.accent.toString(16).padStart(6, "0")}`,
        fontFamily: "Rajdhani",
        fontSize: upgrade.glyph.length > 2 ? "35px" : "48px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const title = this.add.text(140, 34, upgrade.name.toUpperCase(), {
      color: "#252b34",
      fontFamily: "Rajdhani",
      fontSize: "25px",
      fontStyle: "bold",
    });
    const status = this.add.text(
      140,
      78,
      `LEVEL ${String(level).padStart(2, "0")}`,
      {
        color: "#1789a9",
        fontFamily: "Rajdhani",
        fontSize: "20px",
        fontStyle: "bold",
      },
    );
    const bonus = this.add.text(
      140,
      120,
      formatPermanentUpgradeBonus(upgrade, level),
      {
        color: "#596573",
        fontFamily: "Rajdhani",
        fontSize: "18px",
        fontStyle: "bold",
      },
    );
    const hit = this.add
      .rectangle(0, 0, 330, 190, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerup", () => {
      this.selectedUpgradeId = upgrade.id;
      this.message = "";
      this.sound.play(AUDIO.select, { volume: 0.14 });
      this.renderContent();
    });
    container.add([surface, icon, title, status, bonus, hit]);
    return container;
  }

  private createUpgradeDetail(
    upgrade: PermanentUpgradeDefinition,
    level: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(1188, 244);
    const panel = this.add.graphics();
    panel.fillStyle(0x202832, 0.98).fillRect(0, 0, 674, 646);
    panel.lineStyle(1, 0x65717d, 1).strokeRect(0.5, 0.5, 673, 645);
    panel.fillStyle(upgrade.accent, 1).fillRect(0, 0, 674, 6);
    const icon = this.add
      .text(337, 142, upgrade.glyph, {
        color: `#${upgrade.accent.toString(16).padStart(6, "0")}`,
        fontFamily: "Rajdhani",
        fontSize: upgrade.glyph.length > 2 ? "82px" : "112px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const eyebrow = this.add
      .text(337, 246, "GENERAL CALIBRATION // ALL OPERATORS", {
        color: "#69d9fb",
        fontFamily: "Rajdhani",
        fontSize: "17px",
        fontStyle: "bold",
        letterSpacing: 1.5,
      })
      .setOrigin(0.5);
    const title = this.add
      .text(337, 292, upgrade.name.toUpperCase(), {
        color: "#f7f9fb",
        fontFamily: "Rajdhani",
        fontSize: "38px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const description = this.add
      .text(337, 356, upgrade.description, {
        align: "center",
        color: "#c4cbd2",
        fontFamily: "Rajdhani",
        fontSize: "22px",
        fontStyle: "bold",
        wordWrap: { width: 520 },
      })
      .setOrigin(0.5);
    const current = this.add
      .text(
        337,
        430,
        `CURRENT ${formatPermanentUpgradeBonus(upgrade, level)}  //  NEXT ${level >= upgrade.maxLevel ? "MAX" : formatPermanentUpgradeBonus(upgrade, level + 1)}`,
        {
          color: "#8e9aa7",
          fontFamily: "Rajdhani",
          fontSize: "20px",
          fontStyle: "bold",
        },
      )
      .setOrigin(0.5);
    const action = this.createUpgradePurchaseButton(
      337,
      530,
      upgrade,
      level,
      () => {
        if (purchasePermanentUpgrade(upgrade.id)) {
          this.message = `${upgrade.name.toUpperCase()} CALIBRATED`;
          this.sound.play(AUDIO.confirm, { volume: 0.24 });
          this.renderContent();
        }
      },
    );
    const message = this.add
      .text(337, 600, this.message, {
        color: "#78e89b",
        fontFamily: "Rajdhani",
        fontSize: "18px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add([
      panel,
      icon,
      eyebrow,
      title,
      description,
      current,
      action,
      message,
    ]);
    return container;
  }

  private createUpgradePurchaseButton(
    x: number,
    y: number,
    upgrade: PermanentUpgradeDefinition,
    level: number,
    onPurchase: () => void,
  ): Phaser.GameObjects.Container {
    const cost = permanentUpgradeCost(upgrade, level);
    const maxed = level >= upgrade.maxLevel;
    const affordable = loadRosterState().pristineCores >= cost;
    const enabled = !maxed && affordable;
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    const label = this.add
      .text(
        0,
        0,
        maxed
          ? "MAXIMUM LEVEL"
          : affordable
            ? `CALIBRATE // ${cores(cost)}`
            : `REQUIRES ${cores(cost)}`,
        {
          color: enabled ? "#252b34" : "#8e99a4",
          fontFamily: "Rajdhani",
          fontSize: "21px",
          fontStyle: "bold",
          letterSpacing: 1,
        },
      )
      .setOrigin(0.5);
    const redraw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(enabled ? (hovered ? 0x69d9fb : 0xf7f9fb) : 0x303943, 1)
        .fillRect(-165, -31, 330, 62);
      surface
        .lineStyle(1, enabled ? upgrade.accent : 0x56616d, 1)
        .strokeRect(-164.5, -30.5, 329, 61);
    };
    redraw(false);
    const hit = this.add
      .rectangle(-165, -31, 330, 62, 0xffffff, 0)
      .setOrigin(0);
    if (enabled) {
      hit.setInteractive({ useHandCursor: true });
      hit.on("pointerover", () => redraw(true));
      hit.on("pointerout", () => redraw(false));
      hit.on("pointerup", onPurchase);
    }
    container.add([surface, label, hit]);
    return container;
  }

  private renderNipmhs(unlockedIds: readonly NipmhId[]): void {
    const filters: readonly NipmhShopFilter[] = [
      "all",
      "assault",
      "control",
      "sustain",
      "locked",
    ];
    this.contentLayer?.add(
      this.add.text(
        58,
        232,
        `NIPMH ARCHIVE  //  ${unlockedIds.length} / ${NIPMH_CATALOG.length} UNLOCKED`,
        {
          color: "#252b34",
          fontFamily: "Rajdhani",
          fontSize: "26px",
          fontStyle: "bold",
          letterSpacing: 1.1,
        },
      ),
    );
    filters.forEach((filter, index) => {
      this.contentLayer?.add(
        this.createNipmhFilterButton(filter, 58 + index * 130, 274),
      );
    });
    const filterDivider = this.add.graphics();
    filterDivider.fillStyle(0x8e99a4, 0.55).fillRect(714, 274, 2, 46);
    this.contentLayer?.add(filterDivider);

    const filtered = this.sortNipmhs(
      NIPMH_CATALOG.filter((definition) => {
        if (this.nipmhFilter === "all") return true;
        if (this.nipmhFilter === "locked")
          return !unlockedIds.includes(definition.id);
        return definition.category === this.nipmhFilter;
      }),
    );
    const maximumPage = Math.max(0, Math.ceil(filtered.length / 8) - 1);
    this.nipmhPage = Phaser.Math.Clamp(this.nipmhPage, 0, maximumPage);
    const pageEntries = filtered.slice(
      this.nipmhPage * 8,
      this.nipmhPage * 8 + 8,
    );
    if (!filtered.some(({ id }) => id === this.selectedNipmhId))
      this.selectedNipmhId = filtered[0]?.id ?? NIPMH_CATALOG[0]!.id;

    pageEntries.forEach((definition, index) => {
      this.contentLayer?.add(
        this.createNipmhCard(
          definition,
          58 + (index % 4) * 274,
          336 + Math.floor(index / 4) * 216,
          unlockedIds.includes(definition.id),
          definition.id === this.selectedNipmhId,
        ),
      );
    });
    if (maximumPage > 0) {
      this.contentLayer?.add(
        this.createNipmhPageButton(58, 784, "PREVIOUS", -1, maximumPage),
      );
      this.contentLayer?.add(
        this.add
          .text(
            548,
            811,
            `PAGE ${String(this.nipmhPage + 1).padStart(2, "0")} / ${String(maximumPage + 1).padStart(2, "0")}`,
            {
              color: "#596573",
              fontFamily: "Rajdhani",
              fontSize: "18px",
              fontStyle: "bold",
              letterSpacing: 1.4,
            },
          )
          .setOrigin(0.5),
      );
      this.contentLayer?.add(
        this.createNipmhPageButton(842, 784, "NEXT", 1, maximumPage),
      );
    }

    const selected =
      NIPMH_CATALOG.find(({ id }) => id === this.selectedNipmhId) ??
      NIPMH_CATALOG[0]!;
    this.contentLayer?.add(
      this.createNipmhDetail(selected, unlockedIds.includes(selected.id)),
    );
    this.contentLayer?.add(this.createNipmhSortDropdown(734, 274));
  }

  private sortNipmhs(
    definitions: readonly NipmhDefinition<NipmhId>[],
  ): NipmhDefinition<NipmhId>[] {
    const sorted = [...definitions];
    if (this.nipmhSort === "name")
      return sorted.sort((left, right) => left.name.localeCompare(right.name));
    if (this.nipmhSort === "cost-asc")
      return sorted.sort(
        (left, right) => nipmhUnlockCost(left.id) - nipmhUnlockCost(right.id),
      );
    if (this.nipmhSort === "cost-desc")
      return sorted.sort(
        (left, right) => nipmhUnlockCost(right.id) - nipmhUnlockCost(left.id),
      );
    return sorted;
  }

  private createNipmhSortDropdown(
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const width = 398;
    const headerHeight = 46;
    const optionHeight = 42;
    const container = this.add.container(x, y);
    const header = this.add.graphics();
    header
      .fillStyle(this.nipmhSortOpen ? 0x202832 : 0xdde2e6, 1)
      .fillRect(0, 0, width, headerHeight);
    header
      .lineStyle(1, this.nipmhSortOpen ? 0x35c5f2 : 0xaab3bc, 1)
      .strokeRect(0.5, 0.5, width - 1, headerHeight - 1);
    const current =
      NIPMH_SORT_OPTIONS.find(({ id }) => id === this.nipmhSort) ??
      NIPMH_SORT_OPTIONS[0]!;
    const label = this.add
      .text(18, headerHeight / 2, `SORT BY  //  ${current.label}`, {
        color: this.nipmhSortOpen ? "#f7f9fb" : "#48535d",
        fontFamily: "Rajdhani",
        fontSize: "16px",
        fontStyle: "bold",
        letterSpacing: 0.9,
      })
      .setOrigin(0, 0.5);
    const chevron = this.add
      .text(width - 20, headerHeight / 2, this.nipmhSortOpen ? "▲" : "▼", {
        color: this.nipmhSortOpen ? "#69d9fb" : "#596573",
        fontFamily: "Rajdhani",
        fontSize: "14px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const headerHit = this.add
      .rectangle(0, 0, width, headerHeight, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    headerHit.on("pointerup", () => {
      this.nipmhSortOpen = !this.nipmhSortOpen;
      this.sound.play(AUDIO.select, { volume: 0.12 });
      this.renderContent();
    });
    container.add([header, label, chevron, headerHit]);

    if (this.nipmhSortOpen) {
      NIPMH_SORT_OPTIONS.forEach((option, index) => {
        const optionY = headerHeight + 6 + index * optionHeight;
        const selected = option.id === this.nipmhSort;
        const surface = this.add.graphics();
        surface
          .fillStyle(selected ? 0x253b48 : 0x202832, 1)
          .fillRect(0, optionY, width, optionHeight);
        surface
          .lineStyle(1, selected ? 0x35c5f2 : 0x53616d, 1)
          .strokeRect(0.5, optionY + 0.5, width - 1, optionHeight - 1);
        if (selected)
          surface.fillStyle(0x35c5f2, 1).fillRect(0, optionY, 5, optionHeight);
        const optionLabel = this.add
          .text(18, optionY + optionHeight / 2, option.label, {
            color: selected ? "#ffffff" : "#b9c3cb",
            fontFamily: "Rajdhani",
            fontSize: "15px",
            fontStyle: "bold",
            letterSpacing: 0.8,
          })
          .setOrigin(0, 0.5);
        const hit = this.add
          .rectangle(0, optionY, width, optionHeight, 0xffffff, 0)
          .setOrigin(0)
          .setInteractive({ useHandCursor: true });
        hit.on("pointerup", () => {
          this.nipmhSort = option.id;
          this.nipmhSortOpen = false;
          this.nipmhPage = 0;
          this.message = "";
          this.sound.play(AUDIO.select, { volume: 0.14 });
          this.renderContent();
        });
        container.add([surface, optionLabel, hit]);
      });
    }
    return container;
  }

  private createNipmhFilterButton(
    filter: NipmhShopFilter,
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const width = 118;
    const height = 46;
    const selected = this.nipmhFilter === filter;
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    const label = this.add
      .text(width / 2, height / 2, filter.toUpperCase(), {
        color: selected ? "#ffffff" : "#48535d",
        fontFamily: "Rajdhani",
        fontSize: "16px",
        fontStyle: "bold",
        letterSpacing: 0.8,
      })
      .setOrigin(0.5);
    const redraw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(selected ? 0x258eac : hovered ? 0xf7f9fb : 0xdde2e6, 1)
        .fillRect(0, 0, width, height);
      surface
        .lineStyle(1, selected ? 0x35c5f2 : 0xaab3bc, 1)
        .strokeRect(0.5, 0.5, width - 1, height - 1);
    };
    redraw(false);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0);
    bindButtonInteraction(hit, {
      draw: redraw,
      onActivate: () => {
        if (this.nipmhFilter === filter) return;
        this.nipmhFilter = filter;
        this.nipmhPage = 0;
        this.nipmhSortOpen = false;
        this.message = "";
        this.sound.play(AUDIO.select, { volume: 0.14 });
        this.renderContent();
      },
    });
    container.add([surface, label, hit]);
    return container;
  }

  private createNipmhCard(
    definition: NipmhDefinition<NipmhId>,
    x: number,
    y: number,
    unlocked: boolean,
    selected: boolean,
  ): Phaser.GameObjects.Container {
    const accent = NIPMH_ACCENTS[definition.category];
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    surface
      .fillStyle(selected ? 0xf7f9fb : 0xdde2e6, 1)
      .fillRect(0, 0, 252, 198);
    surface
      .lineStyle(selected ? 3 : 1, selected ? accent : 0xaab3bc, 1)
      .strokeRect(0.5, 0.5, 251, 197);
    surface.fillStyle(accent, selected ? 1 : 0.68).fillRect(0, 0, 6, 198);
    surface.fillStyle(0x202832, 1).fillRect(6, 151, 246, 47);
    const art = this.fitImageWithin(
      this.add.image(126, 66, nipmhTextureKey(definition.id)),
      112,
      112,
    ).setAlpha(unlocked ? 1 : 0.34);
    const name = this.add
      .text(126, 126, definition.name.toUpperCase(), {
        align: "center",
        color: "#252b34",
        fontFamily: "Rajdhani",
        fontSize: definition.name.length > 18 ? "17px" : "20px",
        fontStyle: "bold",
        wordWrap: { width: 224 },
      })
      .setOrigin(0.5);
    const category = this.add.text(18, 162, definition.category.toUpperCase(), {
      color: `#${accent.toString(16).padStart(6, "0")}`,
      fontFamily: "Rajdhani",
      fontSize: "12px",
      fontStyle: "bold",
      letterSpacing: 0.7,
    });
    const status = this.add
      .text(
        234,
        174,
        unlocked ? "AVAILABLE" : cores(nipmhUnlockCost(definition.id)),
        {
          color: unlocked ? "#69d9fb" : "#ff8179",
          fontFamily: "Rajdhani",
          fontSize: "15px",
          fontStyle: "bold",
        },
      )
      .setOrigin(1, 0.5);
    const hit = this.add
      .rectangle(0, 0, 252, 198, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerup", () => {
      this.selectedNipmhId = definition.id;
      this.message = "";
      this.nipmhSortOpen = false;
      this.sound.play(AUDIO.select, { volume: 0.14 });
      this.renderContent();
    });
    container.add([surface, art, name, category, status, hit]);
    return container;
  }

  private createNipmhDetail(
    definition: NipmhDefinition<NipmhId>,
    unlocked: boolean,
  ): Phaser.GameObjects.Container {
    const accent = NIPMH_ACCENTS[definition.category];
    const container = this.add.container(1188, 244);
    const panel = this.add.graphics();
    panel.fillStyle(0x202832, 0.98).fillRect(0, 0, 674, 646);
    panel.lineStyle(1, 0x65717d, 1).strokeRect(0.5, 0.5, 673, 645);
    panel.fillStyle(accent, 1).fillRect(0, 0, 674, 6);
    const art = this.fitImageWithin(
      this.add.image(337, 132, nipmhTextureKey(definition.id)),
      208,
      208,
    ).setAlpha(unlocked ? 1 : 0.44);
    const title = this.add
      .text(337, 262, definition.name.toUpperCase(), {
        align: "center",
        color: "#f7f9fb",
        fontFamily: "Rajdhani",
        fontSize: definition.name.length > 19 ? "32px" : "38px",
        fontStyle: "bold",
        wordWrap: { width: 580 },
      })
      .setOrigin(0.5);
    const metadata = this.add
      .text(
        337,
        315,
        `${definition.category.toUpperCase()}  //  LOADOUT COST ${definition.cost}`,
        {
          color: `#${accent.toString(16).padStart(6, "0")}`,
          fontFamily: "Rajdhani",
          fontSize: "18px",
          fontStyle: "bold",
          letterSpacing: 1.2,
        },
      )
      .setOrigin(0.5);
    const keywords = this.add
      .text(337, 350, definition.tags.join("  /  "), {
        color: "#8e9aa7",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 1,
      })
      .setOrigin(0.5);
    const description = new CombatKeywordText(this, definition.description, {
      color: "#c4cbd2",
      fontFamily: "Rajdhani",
      fontSize: "20px",
      fontStyle: "bold",
      lineSpacing: 5,
      width: 548,
      x: 63,
      y: 382,
    });
    const action = this.createPurchaseButton(
      337,
      532,
      unlocked,
      nipmhUnlockCost(definition.id),
      () => {
        if (!unlockNipmh(definition.id)) return;
        this.message = `${definition.name.toUpperCase()} AUTHORIZED`;
        this.sound.play(AUDIO.confirm, { volume: 0.24 });
        this.renderContent();
      },
    );
    const poolLabel = this.add
      .text(337, 582, "ADDS TO MAINTENANCE POOL", {
        color: "#8e9aa7",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 1.3,
      })
      .setOrigin(0.5);
    const message = this.add
      .text(337, 615, this.message, {
        color: "#78e89b",
        fontFamily: "Rajdhani",
        fontSize: "16px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add([
      panel,
      art,
      title,
      metadata,
      keywords,
      description,
      action,
      poolLabel,
      message,
    ]);
    return container;
  }

  private createNipmhPageButton(
    x: number,
    y: number,
    label: string,
    direction: -1 | 1,
    maximumPage: number,
  ): Phaser.GameObjects.Container {
    const width = 220;
    const height = 54;
    const enabled =
      direction < 0 ? this.nipmhPage > 0 : this.nipmhPage < maximumPage;
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    const text = this.add
      .text(width / 2, height / 2, label, {
        color: enabled ? "#26303a" : "#8e99a4",
        fontFamily: "Rajdhani",
        fontSize: "19px",
        fontStyle: "bold",
        letterSpacing: 1,
      })
      .setOrigin(0.5);
    const redraw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(enabled ? (hovered ? 0xffffff : 0xf1f4f6) : 0xd4d9de, 1)
        .fillRect(0, 0, width, height);
      surface
        .lineStyle(1, enabled ? 0x35c5f2 : 0xaab3bc, 1)
        .strokeRect(0.5, 0.5, width - 1, height - 1);
    };
    redraw(false);
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0);
    if (enabled)
      bindButtonInteraction(hit, {
        draw: redraw,
        onActivate: () => {
          this.nipmhPage += direction;
          this.message = "";
          this.nipmhSortOpen = false;
          this.sound.play(AUDIO.select, { volume: 0.14 });
          this.renderContent();
        },
      });
    container.add([surface, text, hit]);
    return container;
  }

  private createPurchaseButton(
    x: number,
    y: number,
    unlocked: boolean,
    cost: number,
    onPurchase: () => void,
  ): Phaser.GameObjects.Container {
    const state = loadRosterState();
    const affordable = state.pristineCores >= cost;
    const enabled = !unlocked && affordable;
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    const label = this.add
      .text(
        0,
        0,
        unlocked
          ? "UNLOCKED"
          : cost === 0
            ? "UNLOCK FREE"
            : affordable
              ? `UNLOCK // ${cores(cost)}`
              : `REQUIRES ${cores(cost)}`,
        {
          color: enabled ? "#252b34" : "#8e99a4",
          fontFamily: "Rajdhani",
          fontSize: "21px",
          fontStyle: "bold",
          letterSpacing: 1,
        },
      )
      .setOrigin(0.5);
    const redraw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(enabled ? (hovered ? 0x69d9fb : 0xf7f9fb) : 0x303943, 1)
        .fillRect(-165, -31, 330, 62);
      surface
        .lineStyle(1, enabled ? 0x35c5f2 : 0x56616d, 1)
        .strokeRect(-164.5, -30.5, 329, 61);
    };
    redraw(false);
    const hit = this.add
      .rectangle(-165, -31, 330, 62, 0xffffff, 0)
      .setOrigin(0);
    if (enabled) {
      hit.setInteractive({ useHandCursor: true });
      hit.on("pointerover", () => redraw(true));
      hit.on("pointerout", () => redraw(false));
      hit.on("pointerup", onPurchase);
    }
    container.add([surface, label, hit]);
    return container;
  }

  private createCharacterStatStrip(
    character: CharacterDefinition,
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const stats = [
      { label: "HP", value: character.hp },
      { label: "SPD", value: character.speed },
      { label: "CRIT", value: character.crit },
    ];
    stats.forEach((stat, index) => {
      const statX = index * 122;
      const surface = this.add.graphics();
      surface.fillStyle(0x151c24, 1).fillRect(statX, 0, 112, 42);
      surface.lineStyle(1, 0x48545f, 1).strokeRect(statX + 0.5, 0.5, 111, 41);
      const label = this.add
        .text(statX + 10, 21, stat.label, {
          color: "#7f8b96",
          fontFamily: "Rajdhani",
          fontSize: "13px",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      const value = this.add
        .text(statX + 101, 21, `${stat.value}`, {
          color: "#f7f9fb",
          fontFamily: "Rajdhani",
          fontSize: "20px",
          fontStyle: "bold",
        })
        .setOrigin(1, 0.5);
      container.add([surface, label, value]);
    });
    return container;
  }

  private createKitRow(
    type: string,
    name: string,
    description: string,
    x: number,
    y: number,
    accent: number,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const surface = this.add.graphics();
    surface.fillStyle(0x171f28, 1).fillRect(0, 0, 618, 56);
    surface.fillStyle(accent, 1).fillRect(0, 0, 4, 56);
    surface.lineStyle(1, 0x414c57, 1).strokeRect(0.5, 0.5, 617, 55);
    const typeLabel = this.add.text(16, 11, type, {
      color: "#7f8b96",
      fontFamily: "Rajdhani",
      fontSize: "12px",
      fontStyle: "bold",
      letterSpacing: 0.8,
    });
    const nameLabel = this.add.text(16, 27, name.toUpperCase(), {
      color: "#f7f9fb",
      fontFamily: "Rajdhani",
      fontSize: name.length > 20 ? "14px" : "16px",
      fontStyle: "bold",
      wordWrap: { width: 170 },
    });
    const detail = new CombatKeywordText(this, description, {
      color: "#b9c2ca",
      fontFamily: "Rajdhani",
      fontSize: "13px",
      fontStyle: "bold",
      lineSpacing: 0,
      width: 398,
      x: 204,
      y: 12,
    });
    container.add([surface, typeLabel, nameLabel, detail]);
    return container;
  }

  private fitImageWithin<T extends Phaser.GameObjects.Image>(
    image: T,
    maximumWidth: number,
    maximumHeight: number,
  ): T {
    const scale = Math.min(
      maximumWidth / image.width,
      maximumHeight / image.height,
    );
    return image.setScale(scale);
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
          previousScene: "shop",
          revealTransition: true,
          transitionProfile,
        });
      },
      transitionProfile,
    );
  }

  private portraitKey(character: CharacterDefinition): string {
    return `shop-${character.id}-portrait`;
  }

  private burstKey(character: CharacterDefinition): string {
    return `shop-${character.id}-burst`;
  }
}

import Phaser from "phaser";

import {
  createLogicalViewportContainer,
  logicalPointerPosition,
} from "../../rendering/DisplayQualityPlugin";

import { gameAudio } from "../../audio/GameAudio";
import type { CharacterDefinition } from "../../profile/CharacterRoster";
import {
  getCharacterTalents,
  TALENT_TREE_TABS,
  type TalentDefinition,
  type TalentTreeId,
} from "../../profile/TalentData";
import {
  isInitialTalent,
  isMainProgressionTalent,
  isMasteryReady,
  isMasteryTalent,
  ownedNonMasteryTalentCount,
  TALENT_MASTERY_HEIGHT,
  TALENT_NODE_HEIGHT,
  TALENT_NODE_WIDTH,
  talentTreePosition,
} from "../../profile/TalentTreeLayout";
import type { RunState } from "../model/RunState";

interface TabView {
  readonly id: TalentTreeId;
  readonly label: Phaser.GameObjects.Text;
  readonly surface: Phaser.GameObjects.Graphics;
}

export interface RunTalentTreeOptions {
  readonly initialRanks?: Readonly<Record<string, number>>;
  readonly portraitKey?: string;
  readonly previewOnly?: boolean;
}

export class RunTalentTree {
  private acceptingInput = false;
  private activeTree: TalentTreeId = "attack";
  private readonly detailName: Phaser.GameObjects.Text;
  private readonly detailText: Phaser.GameObjects.Text;
  private readonly nodeLayer: Phaser.GameObjects.Container;
  private readonly ranks = new Map<string, number>();
  private readonly root: Phaser.GameObjects.Container;
  private readonly spValue: Phaser.GameObjects.Text;
  private readonly tabs: TabView[] = [];
  private inputEnableEvent?: Phaser.Time.TimerEvent;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly character: CharacterDefinition,
    private readonly run: RunState,
    private readonly onClose: () => void,
    private readonly onPurchase: (
      talent: TalentDefinition,
      rank: number,
    ) => void,
    private readonly options: RunTalentTreeOptions = {},
  ) {
    this.root = createLogicalViewportContainer(scene, 2200).setVisible(false);
    this.resetForRun();

    const chrome = scene.add.graphics();
    chrome.fillStyle(0x070b10, 0.88).fillRect(0, 0, 1920, 1080);
    chrome
      .fillStyle(0xf4f7f9, 1)
      .fillPoints(
        [
          new Phaser.Math.Vector2(118, 58),
          new Phaser.Math.Vector2(1802, 58),
          new Phaser.Math.Vector2(1802, 1000),
          new Phaser.Math.Vector2(1780, 1022),
          new Phaser.Math.Vector2(118, 1022),
        ],
        true,
      );
    chrome.fillStyle(0x0d141c, 1).fillRect(118, 58, 1684, 120);
    chrome.fillStyle(0x35c5f2, 1).fillRect(118, 175, 1684, 3);
    chrome.lineStyle(1, 0x6e7b86, 0.7).strokeRect(118.5, 58.5, 1683, 963);
    chrome.fillStyle(0xffffff, 1).fillRect(142, 204, 322, 760);
    chrome.lineStyle(1, 0xb8c2ca, 1).strokeRect(142.5, 204.5, 321, 759);
    chrome.fillStyle(0x101923, 1).fillRect(492, 280, 1284, 684);
    chrome.lineStyle(1, 0x4e6271, 0.65).strokeRect(492.5, 280.5, 1283, 683);
    this.root.add([
      scene.add
        .rectangle(0, 0, 1920, 1080, 0x070b10, 0.01)
        .setOrigin(0)
        .setInteractive(),
      chrome,
      scene.add
        .text(
          158,
          85,
          options.previewOnly ? "SKILL TREE PREVIEW" : "TALENT TREE",
          this.textStyle(50, "#f4f7f9"),
        )
        .setStyle({ letterSpacing: 2 }),
      scene.add
        .text(
          162,
          139,
          `OPERATIVE DEVELOPMENT // ${character.name}`,
          this.textStyle(16, "#9eabb6"),
        )
        .setStyle({ letterSpacing: 2 }),
    ]);

    const portrait = scene.add
      .image(
        303,
        356,
        options.portraitKey ?? `gameplay-hud-portrait-${character.id}`,
      )
      .setDisplaySize(260, 260);
    this.spValue = scene.add
      .text(623, 909, "0", this.textStyle(40, "#202830"))
      .setOrigin(0.5)
      .setVisible(!options.previewOnly);
    const skillPointLabel = scene.add
      .text(623, 850, "AVAILABLE\nSKILL POINTS", this.textStyle(14, "#59656e"))
      .setAlign("center")
      .setLineSpacing(2)
      .setOrigin(0.5)
      .setVisible(!options.previewOnly);

    const skillPointSurface = scene.add
      .graphics()
      .setVisible(!options.previewOnly);
    skillPointSurface
      .fillStyle(0xf1f3f4, 0.98)
      .fillRect(518, 808, 210, 140)
      .lineStyle(1, 0x818c95, 1)
      .strokeRect(518.5, 808.5, 209, 139)
      .fillStyle(0xa3adb5, 1)
      .fillRect(518, 808, 5, 140);
    this.detailName = scene.add
      .text(168, 650, "SELECT A TALENT", this.textStyle(25, "#202830"))
      .setWordWrapWidth(266);
    this.detailText = scene.add
      .text(
        168,
        700,
        "Move over a node to review its complete effect.",
        this.textStyle(16, "#56616b"),
      )
      .setLineSpacing(5)
      .setWordWrapWidth(266);
    this.root.add([
      portrait,
      scene.add
        .text(
          168,
          506,
          character.name,
          this.textStyle(character.name.length > 10 ? 29 : 35, "#202830"),
        )
        .setWordWrapWidth(270),
      scene.add.text(
        170,
        551,
        `${character.squad} // ${character.weaponTag}`,
        this.textStyle(14, "#6d7882"),
      ),
      scene.add.text(168, 613, "TALENT DETAILS", this.textStyle(14, "#78838d")),
      this.detailName,
      this.detailText,
      skillPointSurface,
      skillPointLabel,
      this.spValue,
    ]);

    const rule = scene.add.graphics();
    rule.fillStyle(character.accent, 1).fillRect(168, 588, 72, 3);
    rule.fillStyle(0xaab5be, 0.35).fillRect(240, 589, 196, 1);
    this.root.add(rule);

    TALENT_TREE_TABS.forEach((tab, index) =>
      this.createTab(tab.id, tab.label, 492 + index * 428),
    );
    this.nodeLayer = scene.add.container(0, 0);
    this.root.add(this.nodeLayer);
    this.createCloseButton();
    scene.input.on("pointerdown", this.handlePointerDown, this);
    scene.input.on("pointermove", this.handlePointerMove, this);
  }

  public get isOpen(): boolean {
    return this.root.visible;
  }

  public get isComplete(): boolean {
    return TALENT_TREE_TABS.flatMap((tree) =>
      getCharacterTalents(this.character.id, tree.id),
    )
      .filter((talent) => talent.name !== "Placeholder")
      .every((talent) => this.rank(talent.id) >= talent.max);
  }

  public snapshotRanks(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.ranks);
  }

  public destroy(): void {
    this.acceptingInput = false;
    this.ranks.clear();
    this.inputEnableEvent?.remove(false);
    this.scene.input.off("pointerup", this.enableInputAfterRelease, this);
    this.scene.input.off("pointerdown", this.handlePointerDown, this);
    this.scene.input.off("pointermove", this.handlePointerMove, this);
    this.scene.tweens.killTweensOf(this.root);
    if (!this.root.isDestroyed) this.root.destroy(true);
  }

  public close(): void {
    if (!this.root.visible) return;
    this.acceptingInput = false;
    this.inputEnableEvent?.remove(false);
    this.inputEnableEvent = undefined;
    this.scene.input.off("pointerup", this.enableInputAfterRelease, this);
    this.scene.tweens.killTweensOf(this.root);
    this.root.setVisible(false).setAlpha(1).setY(0);
    this.onClose();
  }

  public open(): void {
    this.acceptingInput = false;
    this.inputEnableEvent?.remove(false);
    this.scene.input.off("pointerup", this.enableInputAfterRelease, this);
    this.activeTree = "attack";
    this.spValue.setText(String(this.run.skillPoints));
    this.refreshTabs();
    this.refreshNodes();
    this.scene.tweens.killTweensOf(this.root);
    this.root.setVisible(true).setAlpha(0).setY(34);
    this.scene.tweens.add({
      alpha: 1,
      duration: 360,
      ease: "Cubic.Out",
      targets: this.root,
      y: 0,
    });
    this.inputEnableEvent = this.scene.time.delayedCall(430, () => {
      this.inputEnableEvent = undefined;
      if (!this.root.visible) return;
      if (this.scene.input.activePointer.isDown) {
        this.scene.input.once("pointerup", this.enableInputAfterRelease, this);
      } else {
        this.acceptingInput = true;
      }
    });
  }

  private enableInputAfterRelease(): void {
    if (this.root.visible) this.acceptingInput = true;
  }

  private resetForRun(): void {
    this.ranks.clear();
    for (const tree of TALENT_TREE_TABS) {
      for (const talent of getCharacterTalents(this.character.id, tree.id)) {
        const storedRank = this.options.initialRanks?.[talent.id];
        const rank = Phaser.Math.Clamp(
          Number.isSafeInteger(storedRank)
            ? Number(storedRank)
            : isInitialTalent(talent)
              ? 1
              : 0,
          0,
          talent.max,
        );
        if (rank <= 0) continue;
        this.ranks.set(talent.id, rank);
        if (!this.options.previewOnly) this.onPurchase(talent, rank);
      }
      this.activateMasteryIfReady(tree.id);
    }
  }

  private createTab(id: TalentTreeId, text: string, x: number): void {
    const surface = this.scene.add.graphics();
    const label = this.scene.add
      .text(x + 214, 233, text, this.textStyle(22, "#33404a"))
      .setOrigin(0.5);
    const hit = this.scene.add
      .rectangle(x, 204, 428, 58, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    this.tabs.push({ id, label, surface });
    this.root.add([surface, label, hit]);
  }

  private refreshTabs(): void {
    this.tabs.forEach((tab, index) => {
      const active = tab.id === this.activeTree;
      const x = 492 + index * 428;
      tab.surface
        .clear()
        .fillStyle(active ? 0x152a38 : 0xffffff, 1)
        .fillRect(x, 204, 428, 58);
      tab.surface
        .lineStyle(1, active ? 0x35c5f2 : 0xb8c2ca, 1)
        .strokeRect(x + 0.5, 204.5, 427, 57);
      if (active) tab.surface.fillStyle(0x35c5f2, 1).fillRect(x, 258, 428, 4);
      tab.label.setColor(active ? "#ffffff" : "#33404a");
    });
  }

  private refreshNodes(): void {
    this.nodeLayer.removeAll(true);
    this.spValue.setText(String(this.run.skillPoints));
    const talents = getCharacterTalents(this.character.id, this.activeTree);
    const regularTalents = talents.filter((talent) => !isMasteryTalent(talent));
    const mastery = talents.find(isMasteryTalent);
    const positions = new Map<string, Phaser.Math.Vector2>();
    regularTalents.forEach((talent) => {
      const position = talentTreePosition(talent);
      positions.set(talent.id, new Phaser.Math.Vector2(position.x, position.y));
    });
    const edges = this.scene.add.graphics();
    regularTalents.forEach((talent) => {
      const target = positions.get(talent.id);
      if (target === undefined) return;
      talent.requires.forEach((requiredId) => {
        const source = positions.get(requiredId);
        if (source === undefined) return;
        const unlocked = this.rank(requiredId) > 0;
        const requiredTalent = regularTalents.find(
          (entry) => entry.id === requiredId,
        );
        const mainPath =
          requiredTalent !== undefined &&
          isMainProgressionTalent(requiredTalent) &&
          isMainProgressionTalent(talent);
        edges.lineStyle(
          mainPath ? 4 : 3,
          mainPath ? 0xffd23f : 0x35c5f2,
          unlocked ? 0.9 : 0.32,
        );
        const sx = source.x + TALENT_NODE_WIDTH / 2;
        const sy = source.y + TALENT_NODE_HEIGHT / 2;
        const tx = target.x + TALENT_NODE_WIDTH / 2;
        const ty = target.y + TALENT_NODE_HEIGHT / 2;
        const middleY = (sy + ty) / 2;
        edges
          .lineBetween(sx, sy, sx, middleY)
          .lineBetween(sx, middleY, tx, middleY)
          .lineBetween(tx, middleY, tx, ty);
      });
    });
    this.nodeLayer.add(edges);
    regularTalents.forEach((talent) => {
      const position = positions.get(talent.id);
      if (position !== undefined)
        this.nodeLayer.add(this.createNode(talent, position.x, position.y));
    });
    if (mastery !== undefined) {
      const position = talentTreePosition(mastery);
      this.nodeLayer.add(
        this.createMasteryNode(mastery, position.x, position.y, talents),
      );
    }
  }

  private createNode(
    talent: TalentDefinition,
    x: number,
    y: number,
  ): Phaser.GameObjects.Container {
    const width = TALENT_NODE_WIDTH;
    const height = TALENT_NODE_HEIGHT;
    const placeholder = talent.name === "Placeholder";
    const mainPath = isMainProgressionTalent(talent);
    const accent = mainPath ? 0xffd23f : 0x35c5f2;
    const rank = this.rank(talent.id);
    const maxed = rank >= talent.max;
    const purchasable =
      !placeholder && (this.options.previewOnly || this.canPurchase(talent));
    const root = this.scene.add.container(0, 0);
    const surface = this.scene.add.graphics();
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface
        .fillStyle(
          mainPath
            ? maxed
              ? 0x302d1b
              : purchasable && hovered
                ? 0x3b3824
                : 0x29281e
            : maxed
              ? 0x173442
              : purchasable && hovered
                ? 0x294553
                : 0x172b36,
          1,
        )
        .fillRect(x, y, width, height);
      surface
        .lineStyle(
          purchasable && hovered ? 2 : 1,
          placeholder ? 0x52616c : accent,
          maxed || purchasable ? 1 : 0.45,
        )
        .strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
      surface
        .fillStyle(
          placeholder ? 0x68747d : accent,
          maxed || purchasable ? 1 : 0.45,
        )
        .fillRect(x, y, 6, height);
    };
    draw(false);
    const name = this.scene.add
      .text(
        x + 24,
        y + 18,
        talent.name.toUpperCase(),
        this.textStyle(
          talent.name.length > 23 ? 20 : 24,
          placeholder ? "#8c969e" : mainPath ? "#ffd23f" : "#80dcf7",
        ),
      )
      .setWordWrapWidth(304);
    const description = this.scene.add
      .text(
        x + 24,
        y + 58,
        talent.desc || "Talent slot reserved for future design.",
        this.textStyle(16, purchasable || maxed ? "#aebbc4" : "#717d86"),
      )
      .setLineSpacing(3)
      .setWordWrapWidth(304);
    const status = this.options.previewOnly
      ? `MAX ${talent.max}    COST ${talent.cost}`
      : maxed
        ? "MAX"
        : `${rank} / ${talent.max}    COST ${talent.cost}`;
    const level = this.scene.add
      .text(
        x + width - 20,
        y + height - 22,
        status,
        this.textStyle(
          14,
          maxed || purchasable ? (mainPath ? "#ffd23f" : "#35c5f2") : "#69757e",
        ),
      )
      .setOrigin(1, 0.5);
    const hit = this.scene.add
      .rectangle(x, y, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: !placeholder });
    hit.on("pointerover", () => {
      draw(true);
      this.showTalentDetails(talent);
    });
    hit.on("pointerout", () => draw(false));
    root.add([surface, name, description, level, hit]);
    return root;
  }

  private createMasteryNode(
    talent: TalentDefinition,
    x: number,
    y: number,
    talents: readonly TalentDefinition[],
  ): Phaser.GameObjects.Container {
    const width = TALENT_NODE_WIDTH;
    const height = TALENT_MASTERY_HEIGHT;
    const owned = ownedNonMasteryTalentCount(talents, (id) => this.rank(id));
    const active = this.rank(talent.id) > 0;
    const root = this.scene.add.container(0, 0);
    const surface = this.scene.add.graphics();
    surface
      .fillStyle(active ? 0x521b19 : 0x222a30, 1)
      .fillRect(x, y, width, height)
      .fillStyle(active ? 0xa72d27 : 0x343e45, 1)
      .fillRect(x + 6, y, width - 6, 48)
      .fillStyle(active ? 0x36100f : 0x1a2126, 1)
      .fillRect(x + 6, y + height - 58, width - 6, 58)
      .lineStyle(2, active ? 0xff6258 : 0x73808a, 1)
      .strokeRect(x + 0.5, y + 0.5, width - 1, height - 1)
      .fillStyle(active ? 0xff6258 : 0x7a858d, 1)
      .fillRect(x, y, 6, height)
      .fillRect(x + 6, y + 47, width - 6, 2)
      .lineStyle(1, active ? 0xff7067 : 0x68757e, 1)
      .lineBetween(x + 6, y + height - 58, x + width, y + height - 58)
      .strokeRect(x + width - 108.5, y + height - 57.5, 108, 57);
    const label = this.scene.add.text(
      x + 24,
      y + 11,
      "MASTERY",
      this.textStyle(23, active ? "#ffffff" : "#e2e7ea"),
    );
    label.setLetterSpacing(2.6);
    const capstone = this.scene.add
      .text(
        x + width - 18,
        y + 25,
        "AUTOMATIC CAPSTONE",
        this.textStyle(11, active ? "#ffd3d0" : "#a8b2b8"),
      )
      .setOrigin(1, 0.5);
    capstone.setLetterSpacing(1.4);
    const progress = this.scene.add
      .text(
        x + width - 54,
        y + height - 29,
        this.options.previewOnly ? "7 NODES" : `${owned} / 7`,
        this.textStyle(29, active ? "#ffffff" : "#d2d9dd"),
      )
      .setOrigin(0.5);
    const name = this.scene.add
      .text(
        x + 24,
        y + 62,
        talent.name.toUpperCase(),
        this.textStyle(talent.name.length > 23 ? 21 : 27, "#ffffff"),
      )
      .setWordWrapWidth(width - 48);
    const description = this.scene.add
      .text(
        x + 24,
        y + 102,
        talent.desc,
        this.textStyle(15, active ? "#efc5c2" : "#a8b2b8"),
      )
      .setWordWrapWidth(width - 48);
    const status = this.scene.add
      .text(
        x + 24,
        y + height - 29,
        this.options.previewOnly
          ? "AUTOMATIC CAPSTONE"
          : active
            ? "AUTOMATICALLY ACTIVE"
            : "AUTO-UNLOCKS AT 7 / 7",
        this.textStyle(14, active ? "#ffffff" : "#b6c0c6"),
      )
      .setOrigin(0, 0.5);
    status.setLetterSpacing(1.1);
    const hit = this.scene.add
      .rectangle(x, y, width, height, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: false });
    hit.on("pointerover", () => {
      this.detailName.setText(talent.name.toUpperCase());
      this.detailText.setText(
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

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.button !== 0 || !this.root.visible || !this.acceptingInput)
      return;
    const { x, y } = logicalPointerPosition(pointer);
    if (x >= 1708 && x <= 1766 && y >= 87 && y <= 145) {
      this.close();
      return;
    }
    if (x >= 492 && x <= 1776 && y >= 204 && y <= 262) {
      const tab = TALENT_TREE_TABS[Math.min(2, Math.floor((x - 492) / 428))];
      if (tab !== undefined && tab.id !== this.activeTree) {
        this.activeTree = tab.id;
        this.refreshTabs();
        this.refreshNodes();
      }
      return;
    }
    const talent = getCharacterTalents(this.character.id, this.activeTree).find(
      (entry) => {
        if (isMasteryTalent(entry)) return false;
        const position = talentTreePosition(entry);
        return (
          x >= position.x &&
          x <= position.x + TALENT_NODE_WIDTH &&
          y >= position.y &&
          y <= position.y + TALENT_NODE_HEIGHT
        );
      },
    );
    if (talent !== undefined && !this.options.previewOnly)
      this.purchase(talent);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.root.visible) return;
    const { x, y } = logicalPointerPosition(pointer);
    const talent = getCharacterTalents(this.character.id, this.activeTree).find(
      (entry) => {
        const position = talentTreePosition(entry);
        const height = isMasteryTalent(entry)
          ? TALENT_MASTERY_HEIGHT
          : TALENT_NODE_HEIGHT;
        return (
          x >= position.x &&
          x <= position.x + TALENT_NODE_WIDTH &&
          y >= position.y &&
          y <= position.y + height
        );
      },
    );
    if (talent !== undefined) this.showTalentDetails(talent);
  }

  private showTalentDetails(talent: TalentDefinition): void {
    this.detailName.setText(talent.name.toUpperCase());
    this.detailText.setText(
      isMasteryTalent(talent)
        ? `${talent.tooltip}\n\nAutomatically activates when all seven other talents in this category are owned. No skill point required.`
        : talent.tooltip,
    );
  }

  private purchase(talent: TalentDefinition): void {
    if (isMasteryTalent(talent)) return;
    if (!this.canPurchase(talent) || !this.run.spendSkillPoints(talent.cost))
      return;
    const rank = this.rank(talent.id) + 1;
    this.ranks.set(talent.id, rank);
    gameAudio.playUi(this.scene, "confirm", 0.26);
    this.onPurchase(talent, rank);
    this.activateMasteryIfReady(talent.tree);
    this.refreshNodes();
    if (this.run.skillPoints <= 0)
      this.scene.time.delayedCall(180, () => this.close());
  }

  private canPurchase(talent: TalentDefinition): boolean {
    if (isMasteryTalent(talent)) return false;
    if (
      this.run.skillPoints < talent.cost ||
      this.rank(talent.id) >= talent.max
    )
      return false;
    if (talent.requires.some((requiredId) => this.rank(requiredId) <= 0))
      return false;
    return true;
  }

  private activateMasteryIfReady(treeId: TalentTreeId): boolean {
    const talents = getCharacterTalents(this.character.id, treeId);
    const mastery = talents.find(isMasteryTalent);
    if (
      mastery === undefined ||
      this.rank(mastery.id) > 0 ||
      !isMasteryReady(talents, (id) => this.rank(id))
    ) {
      return false;
    }
    this.ranks.set(mastery.id, 1);
    this.onPurchase(mastery, 1);
    return true;
  }

  private rank(id: string): number {
    return this.ranks.get(id) ?? 0;
  }

  private createCloseButton(): void {
    const surface = this.scene.add.graphics();
    const draw = (hovered: boolean): void => {
      surface
        .clear()
        .fillStyle(hovered ? 0x263541 : 0x17212b, 1)
        .fillRect(1708, 87, 58, 58);
      surface
        .lineStyle(1, hovered ? 0x35c5f2 : 0x53616d, 1)
        .strokeRect(1708.5, 87.5, 57, 57);
      surface
        .lineStyle(3, 0xe9f0f4, 1)
        .lineBetween(1727, 106, 1747, 126)
        .lineBetween(1747, 106, 1727, 126);
    };
    draw(false);
    const hit = this.scene.add
      .rectangle(1708, 87, 58, 58, 0xffffff, 0)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    this.root.add([surface, hit]);
  }

  private textStyle(
    size: number,
    color: string,
  ): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      color,
      fontFamily: "Rajdhani",
      fontSize: `${size}px`,
      fontStyle: "bold",
      letterSpacing: 0,
    };
  }
}

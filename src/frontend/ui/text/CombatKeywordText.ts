import Phaser from "phaser";

import {
  createLogicalViewportContainer,
  GAME_HEIGHT,
  GAME_WIDTH,
} from "../../rendering/DisplayQualityPlugin";

interface CombatKeywordDefinition {
  readonly aliases: readonly string[];
  readonly color: string;
  readonly description: string;
  readonly label: string;
}

const DANGER_COLOR = "#ff737b";
const DEFENSE_COLOR = "#65dfff";
const RESOURCE_COLOR = "#61d4ad";
const SUPPORT_COLOR = "#ffd15a";
const CONTROL_COLOR = "#c491ff";
const LIGHT_SURFACE_COLORS: Readonly<Record<string, string>> = Object.freeze({
  [CONTROL_COLOR]: "#70409e",
  [DANGER_COLOR]: "#b82936",
  [DEFENSE_COLOR]: "#147a9f",
  [RESOURCE_COLOR]: "#16745b",
  [SUPPORT_COLOR]: "#8b6408",
});

const COMBAT_KEYWORDS: readonly CombatKeywordDefinition[] = [
  {
    aliases: ["Burning", "Burn"],
    color: DANGER_COLOR,
    description:
      "Takes Light damage after each turn. Permanent, non-stacking, and bypasses Guard.",
    label: "Burn",
  },
  {
    aliases: ["Bleeding", "Bleed"],
    color: DANGER_COLOR,
    description:
      "Each uncapped stack deals Light damage after the target's turn and bypasses Guard.",
    label: "Bleed",
  },
  {
    aliases: ["Armor Break"],
    color: DANGER_COLOR,
    description:
      "Scarlet deals 50% more direct damage to the target. Permanent and non-stacking.",
    label: "Armor Break",
  },
  {
    aliases: ["Guard"],
    color: DEFENSE_COLOR,
    description:
      "Forces selected single-target attacks to the guarding unit and reduces the next direct hit by 40%. Area attacks are unaffected; Burn and Bleed bypass it.",
    label: "Guard",
  },
  {
    aliases: ["Royal Shield"],
    color: DEFENSE_COLOR,
    description:
      "Absorbs damage before HP and lasts until broken or Crown's next turn.",
    label: "Royal Shield",
  },
  {
    aliases: ["Taunt"],
    color: DEFENSE_COLOR,
    description:
      "Redirects selected single-target enemy attacks to the user. Area attacks are unaffected.",
    label: "Taunt",
  },
  {
    aliases: ["SP"],
    color: RESOURCE_COLOR,
    description:
      "Shared Skill Points. Normal attacks gain 1; Skills spend them.",
    label: "SP",
  },
  {
    aliases: ["Burst"],
    color: RESOURCE_COLOR,
    description:
      "A personal gauge charged by non-Burst actions. At 100%, the Burst action is ready.",
    label: "Burst",
  },
  {
    aliases: ["Charging"],
    color: SUPPORT_COLOR,
    description:
      "Doubles Snow White's next damaging action and that turn's Auto Turret shot.",
    label: "Charging",
  },
  {
    aliases: ["Auto Turret"],
    color: SUPPORT_COLOR,
    description:
      "Untargetable. Fires a Medium follow-up after each Snow White turn.",
    label: "Auto Turret",
  },
  {
    aliases: ["Clones", "Clone"],
    color: SUPPORT_COLOR,
    description:
      "Permanent Nayuta copies, up to 5. Each normally makes a Light follow-up.",
    label: "Clone",
  },
  {
    aliases: ["Royal Favor"],
    color: SUPPORT_COLOR,
    description:
      "The ally's next damaging action deals 50% more direct damage. Refreshes instead of stacking.",
    label: "Royal Favor",
  },
  {
    aliases: ["Royal Cores", "Royal Core"],
    color: SUPPORT_COLOR,
    description:
      "Captured enemies that add a hit to Marian's attacks. Maximum 2; persist between waves.",
    label: "Royal Core",
  },
  {
    aliases: ["Queen's Signal"],
    color: CONTROL_COLOR,
    description:
      "Marian's target mark, capped at 2. Rapture Queen consumes 2 to Assimilate.",
    label: "Queen's Signal",
  },
  {
    aliases: ["Assimilates", "Assimilate"],
    color: CONTROL_COLOR,
    description:
      "Immediately removes a standard enemy and turns it into a Royal Core.",
    label: "Assimilate",
  },
  {
    aliases: ["Stunned", "Stuns", "Stun"],
    color: CONTROL_COLOR,
    description: "Cannot move or attack until the stun duration ends.",
    label: "Stun",
  },
  {
    aliases: ["Weakness"],
    color: CONTROL_COLOR,
    description:
      "The enemy's next party-directed damaging attack deals 50% less damage.",
    label: "Weakness",
  },
  {
    aliases: ["Reflection"],
    color: CONTROL_COLOR,
    description:
      "The enemy's next damaging attack hurts itself for its intended party damage instead.",
    label: "Reflection",
  },
  {
    aliases: ["Red Hood"],
    color: DANGER_COLOR,
    description:
      "Rapi's transformed mode. Attacks are empowered but damage her and cannot charge Burst.",
    label: "Red Hood",
  },
  {
    aliases: ["Execute"],
    color: DANGER_COLOR,
    description:
      "Immediately defeats the target, regardless of its remaining HP.",
    label: "Execute",
  },
  {
    aliases: ["Revive"],
    color: SUPPORT_COLOR,
    description: "Returns a downed ally to battle.",
    label: "Revive",
  },
] as const;

const ALIASES = COMBAT_KEYWORDS.flatMap((definition) =>
  definition.aliases.map((alias) => ({ alias, definition })),
);
const DEFINITION_BY_ALIAS = new Map(
  ALIASES.map(({ alias, definition }) => [
    alias.toLocaleLowerCase(),
    definition,
  ]),
);
const KEYWORD_PATTERN = new RegExp(
  `\\b(${ALIASES.map(({ alias }) => alias)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|")})\\b`,
  "gi",
);

const TOOLTIP_WIDTH = 350;
const TOOLTIP_PADDING = 18;
const TOOLTIP_BY_SCENE = new WeakMap<Phaser.Scene, CombatKeywordTooltip>();

export interface CombatKeywordTextOptions {
  readonly color: string;
  readonly fontFamily?: string;
  readonly fontSize: string | number;
  readonly fontStyle?: string;
  readonly letterSpacing?: number;
  readonly lineSpacing?: number;
  /** Cap compact summaries without shrinking their font. */
  readonly maxLines?: number;
  readonly onTooltipHoverChange?: (hovered: boolean) => void;
  readonly surface?: "dark" | "light";
  readonly width: number;
  readonly x?: number;
  readonly y?: number;
}

interface TextToken {
  readonly definition?: CombatKeywordDefinition;
  readonly kind: "newline" | "space" | "word";
  readonly text: string;
}

export class CombatKeywordText extends Phaser.GameObjects.Container {
  private readonly options: CombatKeywordTextOptions;
  private readonly tooltip: CombatKeywordTooltip;

  public constructor(
    scene: Phaser.Scene,
    text: string,
    options: CombatKeywordTextOptions,
  ) {
    super(scene, options.x ?? 0, options.y ?? 0);
    this.options = options;
    this.tooltip = getCombatKeywordTooltip(scene);
    scene.add.existing(this);
    this.setText(text);
    this.once(Phaser.GameObjects.Events.DESTROY, () =>
      this.tooltip.hideFor(this),
    );
  }

  public setText(value: string): this {
    this.tooltip.hideFor(this);
    this.removeAll(true);

    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      color: this.options.color,
      fontFamily: this.options.fontFamily ?? "Rajdhani",
      fontSize: this.options.fontSize,
      fontStyle: this.options.fontStyle ?? "500",
      letterSpacing: this.options.letterSpacing ?? 0,
    };
    const lineHeight =
      numericFontSize(this.options.fontSize) +
      (this.options.lineSpacing ?? 0) +
      2;
    const spaceWidth = measureSpace(this.scene, baseStyle);
    let cursorX = 0;
    let cursorY = 0;
    let pendingSpace = 0;

    tokenize(value).forEach((token) => {
      if (token.kind === "newline") {
        cursorX = 0;
        cursorY += lineHeight;
        pendingSpace = 0;
        return;
      }
      if (token.kind === "space") {
        pendingSpace += spaceWidth * token.text.length;
        return;
      }

      const keyword = token.definition;
      const word = this.scene.add.text(0, 0, token.text, {
        ...baseStyle,
        color:
          keyword === undefined
            ? this.options.color
            : colorForSurface(keyword, this.options.surface ?? "dark"),
        fontStyle: keyword === undefined ? baseStyle.fontStyle : "bold",
      });
      if (
        cursorX > 0 &&
        cursorX + pendingSpace + word.width > this.options.width
      ) {
        cursorX = 0;
        cursorY += lineHeight;
        pendingSpace = 0;
      }
      word.setPosition(cursorX + pendingSpace, cursorY);
      cursorX += pendingSpace + word.width;
      pendingSpace = 0;

      if (keyword !== undefined) {
        word.setInteractive({ useHandCursor: true });
        word.on("pointerover", () => {
          this.options.onTooltipHoverChange?.(true);
          const bounds = word.getBounds();
          this.tooltip.showFor(
            this,
            bounds.centerX,
            bounds.bottom + 8,
            keyword,
          );
        });
        word.on("pointerout", () => this.tooltip.scheduleHideFor(this));
      }
      this.add(word);
    });

    const maxLines = this.options.maxLines;
    if (maxLines !== undefined && cursorY >= maxLines * lineHeight) {
      const lastY = (maxLines - 1) * lineHeight;
      const words = this.list as Phaser.GameObjects.Text[];
      for (const word of [...words]) if (word.y > lastY) this.remove(word, true);
      const ellipsis = this.scene.add.text(0, lastY, '…', baseStyle);
      let last = this.list.at(-1) as Phaser.GameObjects.Text | undefined;
      while (last && last.y === lastY && last.x + last.width + ellipsis.width > this.options.width) {
        this.remove(last, true);
        last = this.list.at(-1) as Phaser.GameObjects.Text | undefined;
      }
      ellipsis.x = last?.y === lastY ? last.x + last.width : 0;
      this.add(ellipsis);
      cursorY = lastY;
    }
    this.setSize(this.options.width, cursorY + lineHeight);
    return this;
  }

  public hideKeywordTooltip(): this {
    this.tooltip.hideFor(this);
    return this;
  }

  public setKeywordTooltipHovered(hovered: boolean): void {
    this.options.onTooltipHoverChange?.(hovered);
  }
}

class CombatKeywordTooltip extends Phaser.GameObjects.Container {
  private readonly descriptionText: Phaser.GameObjects.Text;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly titleText: Phaser.GameObjects.Text;
  private owner?: CombatKeywordText;
  private panelHeight = 0;
  private hideTimer?: Phaser.Time.TimerEvent;

  public constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.panel = scene.add.graphics();
    this.titleText = scene.add.text(TOOLTIP_PADDING, 13, "", {
      fontFamily: "Rajdhani",
      fontSize: "18px",
      fontStyle: "bold",
      letterSpacing: 0.8,
    });
    this.descriptionText = scene.add.text(TOOLTIP_PADDING, 42, "", {
      color: "#d7e0e8",
      fontFamily: "Rajdhani",
      fontSize: "15px",
      fontStyle: "500",
      lineSpacing: 2,
      wordWrap: { width: TOOLTIP_WIDTH - TOOLTIP_PADDING * 2 },
    });
    this.add([this.panel, this.titleText, this.descriptionText]);
    scene.add.existing(this);
    createLogicalViewportContainer(scene, 10_000).add(this);
    this.setVisible(false).setInteractive(
      new Phaser.Geom.Rectangle(0, 0, TOOLTIP_WIDTH, 1),
      Phaser.Geom.Rectangle.Contains,
    );
    this.on("pointerover", () => {
      this.hideTimer?.remove(false);
      this.hideTimer = undefined;
      this.owner?.setKeywordTooltipHovered(true);
    });
    this.on("pointerout", () => this.scheduleHide());
  }

  public showFor(
    owner: CombatKeywordText,
    anchorX: number,
    anchorY: number,
    keyword: CombatKeywordDefinition,
  ): void {
    if (!this.active) {
      return;
    }
    this.hideTimer?.remove(false);
    this.hideTimer = undefined;
    this.owner = owner;
    this.titleText.setText(keyword.label.toUpperCase()).setColor(keyword.color);
    this.descriptionText.setText(keyword.description);
    this.panelHeight = this.descriptionText.height + 58;
    this.drawPanel(keyword.color);

    const viewWidth = GAME_WIDTH;
    const viewHeight = GAME_HEIGHT;
    const x = Phaser.Math.Clamp(
      anchorX - TOOLTIP_WIDTH / 2,
      12,
      viewWidth - TOOLTIP_WIDTH - 12,
    );
    const preferredY = anchorY;
    const y =
      preferredY + this.panelHeight <= viewHeight - 12
        ? preferredY
        : Math.max(12, anchorY - this.panelHeight - 28);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, TOOLTIP_WIDTH, this.panelHeight),
      Phaser.Geom.Rectangle.Contains,
    );
    this.setPosition(x, y).setVisible(true).setAlpha(1);
  }

  public scheduleHideFor(owner: CombatKeywordText): void {
    if (this.owner !== owner) {
      return;
    }
    this.scheduleHide();
  }

  public hideFor(owner: CombatKeywordText): void {
    if (this.owner !== owner) {
      return;
    }
    this.hideTimer?.remove(false);
    this.hideTimer = undefined;
    this.owner = undefined;
    this.setVisible(false);
    owner.setKeywordTooltipHovered(false);
  }

  private scheduleHide(): void {
    const owner = this.owner;
    if (owner === undefined) {
      return;
    }
    this.hideTimer?.remove(false);
    this.hideTimer = this.scene.time.delayedCall(120, () => {
      this.hideTimer = undefined;
      if (this.owner === owner) {
        this.hideFor(owner);
      }
    });
  }

  private drawPanel(accent: string): void {
    const accentNumber = Phaser.Display.Color.HexStringToColor(accent).color;
    this.panel.clear();
    this.panel
      .fillStyle(0x080d12, 0.42)
      .fillRoundedRect(5, 6, TOOLTIP_WIDTH, this.panelHeight, 7)
      .fillStyle(0x17212b, 0.99)
      .lineStyle(2, accentNumber, 0.95)
      .fillRoundedRect(0, 0, TOOLTIP_WIDTH, this.panelHeight, 7)
      .strokeRoundedRect(0, 0, TOOLTIP_WIDTH, this.panelHeight, 7)
      .fillStyle(accentNumber, 1)
      .fillRect(0, 0, 5, this.panelHeight);
  }
}

function getCombatKeywordTooltip(scene: Phaser.Scene): CombatKeywordTooltip {
  const existing = TOOLTIP_BY_SCENE.get(scene);
  if (existing !== undefined && existing.active) {
    return existing;
  }
  const tooltip = new CombatKeywordTooltip(scene);
  TOOLTIP_BY_SCENE.set(scene, tooltip);
  return tooltip;
}

function tokenize(value: string): readonly TextToken[] {
  const parts = value.split(KEYWORD_PATTERN).filter((part) => part.length > 0);
  return parts.flatMap((part): TextToken[] => {
    const definition = DEFINITION_BY_ALIAS.get(part.toLocaleLowerCase());
    if (definition !== undefined) {
      return [{ definition, kind: "word", text: part }];
    }
    return (
      part.match(/\r?\n|[^\S\r\n]+|[^\s]+/g)?.map((text) => ({
        kind: /^\r?\n$/.test(text)
          ? "newline"
          : /^\s+$/.test(text)
            ? "space"
            : "word",
        text,
      })) ?? []
    );
  });
}

function measureSpace(
  scene: Phaser.Scene,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): number {
  const spaced = scene.add.text(-10_000, -10_000, "x x", style);
  const tight = scene.add.text(-10_000, -10_000, "xx", style);
  const width = Math.max(2, spaced.width - tight.width);
  spaced.destroy();
  tight.destroy();
  return width;
}

function numericFontSize(fontSize: string | number): number {
  const parsed =
    typeof fontSize === "number" ? fontSize : Number.parseFloat(fontSize);
  return Number.isFinite(parsed) ? parsed : 16;
}

function colorForSurface(
  keyword: CombatKeywordDefinition,
  surface: "dark" | "light",
): string {
  return surface === "light"
    ? (LIGHT_SURFACE_COLORS[keyword.color] ?? keyword.color)
    : keyword.color;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

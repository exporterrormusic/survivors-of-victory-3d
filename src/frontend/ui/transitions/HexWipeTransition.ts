import Phaser from "phaser";

import { createLogicalViewportContainer } from "../../rendering/DisplayQualityPlugin";

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const FRAME_SLICE_COUNT = 8;
const COVER_DESYNC_MS = 320;
const COVER_SLICE_STAGGER_MS = 18;
const COVER_CARD_DELAY_MS = 170;
const COVER_CARD_IN_MS = 190;
const COVER_COMPLETE_MS = 700;
const REVEAL_HOLD_MS = 560;
const REVEAL_SLIDE_MS = 360;
const REVEAL_SLICE_STAGGER_MS = 22;
const REVEAL_CLEANUP_MS = 40;
// Reserve the top of the safe integer range for full-screen scene handoffs.
// Field HUDs and modal panels intentionally use high depths, so a modest UI
// depth is not sufficient to guarantee that a transition masks the whole scene.
const TRANSITION_DEPTH = Number.MAX_SAFE_INTEGER;
const BARCODE_URL = "https://www.youtube.com/@ExportErrorMusic";
const CODE_128_PATTERNS = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
] as const;

export interface HexWipeProfile {
  readonly detail: string;
  readonly title: string;
}

interface HexWipePalette {
  readonly accent: number;
  readonly barcodeBar: number;
  readonly barcodePlate: number;
  readonly barcodePlateLine: number;
  readonly detailText: string;
  readonly fieldFill: number;
  readonly fieldLine: number;
  readonly registration: number;
  readonly titleText: string;
}

const HEX_WIPE_PALETTE: HexWipePalette = {
  accent: 0x24bce7,
  barcodeBar: 0x20262e,
  barcodePlate: 0xffffff,
  barcodePlateLine: 0xc4cbd2,
  detailText: "#59636e",
  fieldFill: 0xf4f6f8,
  fieldLine: 0xd2d8de,
  registration: 0xe94d54,
  titleText: "#252b34",
};

export const NIKKE_TRANSITION_PROFILES: readonly HexWipeProfile[] = [
  {
    detail:
      "PIONEER // A HIGH-DAMAGE SNIPER WHO CHARGES DECISIVE SHOTS AND FIELDS AN AUTONOMOUS TURRET",
    title: "SNOW WHITE",
  },
  {
    detail:
      "PIONEER // A CLOSE-RANGE DUELIST WHO CONVERTS PERSONAL RISK INTO OVERWHELMING POWER",
    title: "SCARLET",
  },
  {
    detail:
      "PIONEER // A STAFF-WIELDING SUPPORT SPECIALIST WITH GROUP HEALING AND REVIVAL",
    title: "RAPUNZEL",
  },
  {
    detail:
      "PIONEER // A MOBILE SMG OPERATOR WHO MULTIPLIES PRESSURE THROUGH COMBAT CLONES",
    title: "NAYUTA",
  },
  {
    detail:
      "GODDESS // A COMMAND SPECIALIST WHO CONTROLS ENEMY TEMPO AND CALLS REINFORCEMENTS",
    title: "COMMANDER",
  },
  {
    detail:
      "WHITE KNIGHT // A HEAVY GUNNER ABLE TO SEIZE CONTROL OF NORMAL ENEMY COMBATANTS",
    title: "MARIAN",
  },
  {
    detail:
      "WHITE KNIGHT // AN ARMORED CAVALRY GUNNER WITH AN INVINCIBLE FORWARD CHARGE",
    title: "CROWN",
  },
  {
    detail:
      "HEAVY GRAM // A SHOTGUN SPECIALIST WHOSE IMPACTS BLOOM INTO SECONDARY EXPLOSIONS",
    title: "KILO",
  },
  {
    detail:
      "EDEN // A TECHNICAL CONTROLLER SUPPORTED BY AUTONOMOUS HUNT AND SHIELD DRONES",
    title: "CECIL",
  },
  {
    detail:
      "REAL KINDNESS // A CONTROL-ORIENTED SMG OPERATOR WHO CHARMS ENEMIES AND DRAINS VITALITY",
    title: "SIN",
  },
  {
    detail:
      "MNEMOSYNE // A TIME-MANIPULATING SNIPER WHO TRADES FUEL FOR SUPERIOR REACTION SPEED",
    title: "WELLS",
  },
] as const;

let nextProfileIndex = 0;
let nextCaptureTextureId = 0;

interface ActiveRevealState {
  coverQueued: boolean;
  readonly endTime: number;
}

const activeReveals = new WeakMap<Phaser.Scene, ActiveRevealState>();

export function nextNikkeTransitionProfile(): HexWipeProfile {
  const profile =
    NIKKE_TRANSITION_PROFILES[
      nextProfileIndex % NIKKE_TRANSITION_PROFILES.length
    ]!;
  nextProfileIndex += 1;
  return profile;
}

type HexWipeLabel = HexWipeProfile | string;

interface CapturedSlice {
  readonly delay: number;
  readonly image: Phaser.GameObjects.Image;
  readonly offsetX: number;
  readonly textureKey: string;
}

interface RevealSlice {
  readonly container: Phaser.GameObjects.Container;
  readonly delay: number;
  readonly offsetX: number;
}

// Keep the existing exported function names while this visual direction is
// being evaluated so every scene can exercise the prototype unchanged.
export function playHexWipeCover(
  scene: Phaser.Scene,
  onCovered: () => void,
  label: HexWipeLabel = "ENCOUNTER",
): Phaser.GameObjects.Container {
  const container = createLogicalViewportContainer(scene, TRANSITION_DEPTH);
  const activeReveal = activeReveals.get(scene);
  const revealWait = Math.max(
    0,
    (activeReveal?.endTime ?? scene.time.now) - scene.time.now,
  );
  if (activeReveal !== undefined) {
    activeReveal.coverQueued = true;
  }
  scene.input.enabled = false;

  const beginCover = (): void => {
    if (!scene.sys.isActive()) {
      return;
    }
    const palette = HEX_WIPE_PALETTE;
    const field = scene.add
      .rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, palette.fieldFill, 1)
      .setOrigin(0);
    container.add(field);

    const slices = createCapturedSlices(scene, container);
    const textureKeys = [
      ...new Set(slices.map(({ textureKey }) => textureKey)),
    ];
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      textureKeys.forEach((textureKey) => {
        if (scene.textures.exists(textureKey)) {
          scene.textures.remove(textureKey);
        }
      });
    });

    slices.forEach(({ delay, image, offsetX }) => {
      scene.tweens.add({
        alpha: 0,
        delay,
        duration: COVER_DESYNC_MS,
        ease: "Cubic.In",
        scaleY: 0.12,
        targets: image,
        x: image.x + offsetX,
      });
    });

    const wash = scene.add
      .rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, palette.fieldFill, 1)
      .setOrigin(0)
      .setAlpha(0);
    container.add(wash);
    scene.tweens.add({
      alpha: 1,
      delay: 70,
      duration: 330,
      ease: "Sine.InOut",
      targets: wash,
    });

    const motif = createTransitionMotif(scene, label, palette, true);
    const motifY = motif.y;
    motif.setAlpha(0).setY(motifY + 14);
    container.add(motif);
    scene.tweens.add({
      alpha: 1,
      delay: COVER_CARD_DELAY_MS,
      duration: COVER_CARD_IN_MS,
      ease: "Cubic.Out",
      targets: motif,
      y: motifY,
    });
    scene.time.delayedCall(COVER_COMPLETE_MS, () => {
      if (scene.sys.isActive()) {
        onCovered();
      }
    });
  };

  if (revealWait <= 0) {
    beginCover();
  } else {
    scene.time.delayedCall(revealWait, beginCover);
  }
  return container;
}

export function playHexWipeReveal(
  scene: Phaser.Scene,
  label: HexWipeLabel = "ENCOUNTER",
): Phaser.GameObjects.Container {
  const palette = HEX_WIPE_PALETTE;
  const container = createLogicalViewportContainer(scene, TRANSITION_DEPTH);
  const field = scene.add
    .rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, palette.fieldFill, 1)
    .setOrigin(0);
  const slices = createRevealSlices(scene, container, palette);
  const maximumDelay = Math.max(...slices.map(({ delay }) => delay), 0);
  const motif = createTransitionMotif(scene, label, palette, false);
  container.addAt(field, 0);
  container.add(motif);
  const revealDuration =
    REVEAL_HOLD_MS + maximumDelay + REVEAL_SLIDE_MS + REVEAL_CLEANUP_MS + 30;
  const revealState: ActiveRevealState = {
    coverQueued: false,
    endTime: scene.time.now + revealDuration,
  };
  activeReveals.set(scene, revealState);
  scene.input.enabled = false;
  let cleanupScheduled = false;
  const handleShutdown = (): void => {
    if (activeReveals.get(scene) === revealState) {
      activeReveals.delete(scene);
    }
  };
  const finishReveal = (): void => {
    if (cleanupScheduled) {
      return;
    }
    cleanupScheduled = true;
    scene.time.delayedCall(REVEAL_CLEANUP_MS, () => {
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, handleShutdown);
      if (activeReveals.get(scene) === revealState) {
        activeReveals.delete(scene);
        if (!revealState.coverQueued && scene.sys.isActive()) {
          scene.input.enabled = true;
        }
      }
      container.destroy(true);
    });
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, handleShutdown);
  scene.tweens.add({
    alpha: 0,
    delay: REVEAL_HOLD_MS - 90,
    duration: 170,
    ease: "Cubic.In",
    targets: motif,
    y: motif.y - 12,
  });
  scene.tweens.add({
    alpha: 0,
    delay: REVEAL_HOLD_MS,
    duration: 120,
    ease: "Sine.In",
    targets: field,
  });
  const finalSlice = slices.find(({ delay }) => delay === maximumDelay);
  slices.forEach((slice) => {
    scene.tweens.add({
      delay: REVEAL_HOLD_MS + slice.delay,
      duration: REVEAL_SLIDE_MS,
      ease: "Cubic.InOut",
      targets: slice.container,
      x: slice.offsetX,
      onComplete: slice === finalSlice ? finishReveal : undefined,
    });
  });
  if (finalSlice === undefined) {
    scene.time.delayedCall(revealDuration - REVEAL_CLEANUP_MS, finishReveal);
  }
  return container;
}

function createCapturedSlices(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
): CapturedSlice[] {
  const source = scene.game.canvas;
  const snapshot = document.createElement("canvas");
  snapshot.width = source.width;
  snapshot.height = source.height;
  const snapshotContext = snapshot.getContext("2d");
  if (snapshotContext === null) {
    return [];
  }
  try {
    snapshotContext.drawImage(source, 0, 0);
  } catch {
    return [];
  }

  const captureId = nextCaptureTextureId;
  nextCaptureTextureId += 1;
  const textureKey = `signal-transition-${captureId}`;
  const texture = scene.textures.addCanvas(textureKey, snapshot);
  if (texture === null) {
    return [];
  }
  const slices: CapturedSlice[] = [];
  for (let index = 0; index < FRAME_SLICE_COUNT; index += 1) {
    const logicalTop = Math.round((index * CANVAS_HEIGHT) / FRAME_SLICE_COUNT);
    const logicalBottom = Math.round(
      ((index + 1) * CANVAS_HEIGHT) / FRAME_SLICE_COUNT,
    );
    const logicalHeight = logicalBottom - logicalTop;
    const sourceTop = Math.round((logicalTop * source.height) / CANVAS_HEIGHT);
    const sourceBottom = Math.round(
      (logicalBottom * source.height) / CANVAS_HEIGHT,
    );
    const sourceHeight = Math.max(1, sourceBottom - sourceTop);
    const frameName = `slice-${index}`;
    const frame = texture.add(
      frameName,
      0,
      0,
      sourceTop,
      source.width,
      sourceHeight,
    );
    if (frame === null) {
      continue;
    }
    const image = scene.add
      .image(
        CANVAS_WIDTH / 2,
        logicalTop + logicalHeight / 2,
        textureKey,
        frameName,
      )
      .setDisplaySize(CANVAS_WIDTH + 2, logicalHeight + 2);
    container.add(image);
    const direction = index % 2 === 0 ? -1 : 1;
    slices.push({
      delay: index * COVER_SLICE_STAGGER_MS,
      image,
      offsetX: direction * (90 + (index % 3) * 38),
      textureKey,
    });
  }
  return slices;
}

function createRevealSlices(
  scene: Phaser.Scene,
  transition: Phaser.GameObjects.Container,
  palette: HexWipePalette,
): RevealSlice[] {
  return Array.from({ length: FRAME_SLICE_COUNT }, (_, index) => {
    const top = Math.round((index * CANVAS_HEIGHT) / FRAME_SLICE_COUNT);
    const bottom = Math.round(
      ((index + 1) * CANVAS_HEIGHT) / FRAME_SLICE_COUNT,
    );
    const height = bottom - top;
    const container = scene.add.container(0, top);
    const surface = scene.add
      .rectangle(0, 0, CANVAS_WIDTH + 8, height + 2, palette.fieldFill, 1)
      .setOrigin(0)
      .setStrokeStyle(1, palette.fieldLine, 0.34);
    container.add(surface);
    transition.add(container);
    const direction = index % 2 === 0 ? -1 : 1;
    return {
      container,
      delay: index * REVEAL_SLICE_STAGGER_MS,
      offsetX: direction * (CANVAS_WIDTH + 320),
    };
  });
}

function createTransitionMotif(
  scene: Phaser.Scene,
  label: HexWipeLabel,
  palette: HexWipePalette,
  animateRule: boolean,
): Phaser.GameObjects.Container {
  const motif = scene.add.container(0, 0);
  const titleText = typeof label === "string" ? label : label.title;
  const detailText =
    typeof label === "string"
      ? `ARK SYSTEM // SCENE HANDOFF // ${titleText}`
      : label.detail;
  const titleSize =
    titleText.length > 15 ? 88 : titleText.length > 10 ? 104 : 126;
  const title = scene.add
    .text(330, 350, `[${titleText}]`, {
      color: palette.titleText,
      fontFamily: "Rajdhani",
      fontSize: `${titleSize}px`,
      fontStyle: "bold",
      letterSpacing: 6,
    })
    .setOrigin(0, 0.5);
  const detail = scene.add.text(334, 476, detailText, {
    color: palette.detailText,
    fontFamily: "Rajdhani",
    fontSize: "20px",
    fontStyle: "bold",
    letterSpacing: 2,
    wordWrap: { width: 1120 },
  });
  const rule = scene.add
    .rectangle(330, 548, 1260, 4, palette.accent, 1)
    .setOrigin(0);
  if (animateRule) {
    rule.setScale(0, 1);
    scene.tweens.add({
      delay: COVER_CARD_DELAY_MS + 35,
      duration: 260,
      ease: "Cubic.Out",
      scaleX: 1,
      targets: rule,
    });
  }
  const barcode = createCode128Barcode(scene, BARCODE_URL, palette);
  barcode.setPosition(610, 616);
  const protocol = scene.add.text(
    1120,
    612,
    "HANDOFF PROTOCOL 03 // FRAME SYNC",
    {
      color: palette.detailText,
      fontFamily: "Rajdhani",
      fontSize: "17px",
      fontStyle: "bold",
      letterSpacing: 1.8,
    },
  );
  const index = scene.add.text(1534, 602, "03", {
    color: `#${palette.registration.toString(16).padStart(6, "0")}`,
    fontFamily: "Rajdhani",
    fontSize: "32px",
    fontStyle: "bold",
  });
  motif.add([title, detail, rule, barcode, protocol, index]);
  return motif;
}

function createCode128Barcode(
  scene: Phaser.Scene,
  value: string,
  palette: HexWipePalette,
): Phaser.GameObjects.Container {
  const symbols = encodeCode128B(value);
  const quietZoneModules = 12;
  const moduleWidth = 1.05;
  const barHeight = 34;
  const symbolModules = symbols.reduce(
    (total, symbol) =>
      total +
      [...CODE_128_PATTERNS[symbol]!].reduce(
        (sum, width) => sum + Number(width),
        0,
      ),
    0,
  );
  const barcodeWidth = (symbolModules + quietZoneModules * 2) * moduleWidth;
  const barcode = scene.add.container(0, 0);
  const plate = scene.add
    .rectangle(
      0,
      barHeight / 2,
      barcodeWidth,
      barHeight + 12,
      palette.barcodePlate,
      1,
    )
    .setStrokeStyle(1, palette.barcodePlateLine, 1);
  const bars = scene.add.graphics();
  let x = -barcodeWidth / 2 + quietZoneModules * moduleWidth;
  symbols.forEach((symbol) => {
    [...CODE_128_PATTERNS[symbol]!].forEach((width, index) => {
      const pixelWidth = Number(width) * moduleWidth;
      if (index % 2 === 0) {
        bars
          .fillStyle(palette.barcodeBar, 1)
          .fillRect(x, 0, pixelWidth, barHeight);
      }
      x += pixelWidth;
    });
  });
  barcode.add([plate, bars]);
  return barcode;
}

function encodeCode128B(value: string): number[] {
  const data = [...value].map((character) => {
    const code = character.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new RangeError("Code 128-B only supports printable ASCII.");
    }
    return code - 32;
  });
  const startCodeB = 104;
  const checksum =
    (startCodeB +
      data.reduce((sum, symbol, index) => sum + symbol * (index + 1), 0)) %
    103;
  return [startCodeB, ...data, checksum, 106];
}

import Phaser from "phaser";

import { gameAudio, preloadLobbyAudio } from "../audio/GameAudio";
import { bindButtonInteraction } from "../ui/interaction/ButtonInteraction";
import { captureDevelopmentPreview } from "../dev/capturePreview";
import { CHARACTERS } from "../profile/CharacterRoster";
import { loadRunRecords, type RunRecord } from "../profile/RunRecords";
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
  select: "records-select",
} as const;

interface RecordsSceneData {
  readonly previousScene?: string;
  readonly revealTransition?: boolean;
  readonly transitionProfile?: HexWipeProfile;
}

export class RecordsScene extends Phaser.Scene {
  private audioSettings: AudioSettings = loadAudioSettings();
  private leaving = false;
  private previousScene?: string;
  private revealTransition = false;
  private transitionProfile?: HexWipeProfile;

  public constructor() {
    super("records");
  }

  public init(data: RecordsSceneData = {}): void {
    this.leaving = false;
    this.previousScene = data.previousScene;
    this.revealTransition = data.revealTransition ?? false;
    this.transitionProfile = data.transitionProfile;
  }

  public preload(): void {
    this.load.audio(AUDIO.select, "assets/audio/ui/select.wav");
    preloadLobbyAudio(this);
  }

  public create(): void {
    this.audioSettings = loadAudioSettings();
    const records = [...loadRunRecords()].sort(
      (left, right) => right.score - left.score || right.wave - left.wave,
    );
    this.createBackdrop();
    this.createHeader(records.length);
    this.createBackButton();
    this.createRecordsTable(records);
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
    captureDevelopmentPreview(this, "records");
  }

  private createBackdrop(): void {
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x10171e).setOrigin(0);
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x8aa0ae, 0.065);
    for (let x = -420; x < WIDTH + 420; x += 205) {
      grid.lineBetween(x, 76, x + 430, HEIGHT - 48);
    }
    for (let y = 178; y < HEIGHT - 48; y += 108) {
      grid.lineBetween(0, y, WIDTH, y);
    }

    const chrome = this.add.graphics();
    chrome.fillStyle(0x080c11, 0.98).fillRect(0, 0, WIDTH, 76);
    chrome.fillRect(0, HEIGHT - 48, WIDTH, 48);
    chrome.fillStyle(0x35c5f2, 1).fillRect(0, 74, 515, 3);
    chrome.fillStyle(0x65727e, 0.35).fillRect(515, 75, WIDTH - 515, 1);
    this.add.text(52, 25, "ARK SYSTEM / OPERATION RECORDS", {
      color: "#f2f5f7",
      fontFamily: "Rajdhani",
      fontSize: "26px",
      fontStyle: "bold",
      letterSpacing: 1.8,
    });
    this.add.text(1774, 26, "04", {
      color: "#9aa4af",
      fontFamily: "Rajdhani",
      fontSize: "25px",
      fontStyle: "bold",
    });
    this.add.text(52, 1038, "LOCAL RECORDS // COMPLETED FLOORS", {
      color: "#8a949f",
      fontFamily: "Rajdhani",
      fontSize: "15px",
      fontStyle: "bold",
      letterSpacing: 2,
    });
    this.add
      .text(1818, 1038, "SCORE DESC // TIME ASC", {
        color: "#35c5f2",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 1.5,
      })
      .setOrigin(1, 0);
  }

  private createHeader(recordCount: number): void {
    this.add.text(70, 112, "RECORDS", {
      color: "#f4f7f9",
      fontFamily: "Rajdhani",
      fontSize: "60px",
      fontStyle: "bold",
      letterSpacing: 2,
    });
    this.add.text(
      73,
      181,
      "LOCAL PERSONAL BESTS // COMPLETED OPERATIONS ONLY",
      {
        color: "#85939e",
        fontFamily: "Rajdhani",
        fontSize: "17px",
        fontStyle: "bold",
        letterSpacing: 2.6,
      },
    );
    this.add
      .text(1438, 190, `${recordCount} / ${CHARACTERS.length} NIKKE RANKED`, {
        color: "#35c5f2",
        fontFamily: "Rajdhani",
        fontSize: "17px",
        fontStyle: "bold",
        letterSpacing: 1.8,
      })
      .setOrigin(1, 0.5);
    const marker = this.add.graphics();
    marker.fillStyle(0x35c5f2, 1).fillRect(73, 216, 82, 4);
    marker.fillStyle(0x76828d, 0.28).fillRect(155, 217, 1283, 1);
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
        color: "#dce3e8",
        fontFamily: "Rajdhani",
        fontSize: "23px",
        fontStyle: "bold",
        letterSpacing: 1.2,
      })
      .setOrigin(0.5);
    const draw = (hovered: boolean): void => {
      surface.clear();
      surface.fillStyle(hovered ? 0x263641 : 0x182129, 1);
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
        .lineStyle(1, hovered ? 0x35c5f2 : 0x53616c, 1)
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
      surface.lineStyle(3, hovered ? 0x35c5f2 : 0x9aa7b1, 1);
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

  private createRecordsTable(records: readonly RunRecord[]): void {
    const recordByCharacter = new Map(
      records.map((record) => [record.characterId, record]),
    );
    const validRanked = records.filter((record) =>
      CHARACTERS.some((character) => character.id === record.characterId),
    );
    const orderedCharacters = [
      ...validRanked.map((record) =>
        CHARACTERS.find((character) => character.id === record.characterId)!,
      ),
      ...CHARACTERS.filter((character) => !recordByCharacter.has(character.id)),
    ];

    const table = this.add.graphics();
    table.fillStyle(0x0b1016, 0.96).fillRect(70, 258, 1780, 704);
    table.lineStyle(1, 0x46545f, 1).strokeRect(70.5, 258.5, 1779, 703);
    table.fillStyle(0x202b34, 1).fillRect(70, 258, 1780, 58);
    table.fillStyle(0x35c5f2, 1).fillRect(70, 312, 1780, 4);

    const headings = [
      { label: "RANK", x: 118 },
      { label: "NIKKE", x: 250 },
      { label: "BEST SCORE", x: 850 },
      { label: "BEST WAVE", x: 1120 },
      { label: "DIFFICULTY", x: 1350 },
      { label: "MODE", x: 1590 },
    ] as const;
    headings.forEach(({ label, x }) => {
      this.add
        .text(x, 287, label, {
          color: "#8f9ca7",
          fontFamily: "Rajdhani",
          fontSize: "15px",
          fontStyle: "bold",
          letterSpacing: 1.8,
        })
        .setOrigin(0, 0.5);
    });

    orderedCharacters.forEach((character, index) => {
      const record = recordByCharacter.get(character.id);
      const rank =
        record === undefined
          ? undefined
          : validRanked.findIndex(
              (entry) => entry.characterId === character.id,
            ) + 1;
      this.createRecordRow(
        character.name,
        record,
        rank,
        70,
        316 + index * 58,
        index,
      );
    });
  }

  private createRecordRow(
    characterName: string,
    record: RunRecord | undefined,
    rank: number | undefined,
    x: number,
    y: number,
    index: number,
  ): void {
    const row = this.add.graphics();
    const ranked = record !== undefined && rank !== undefined;
    row
      .fillStyle(index % 2 === 0 ? 0x111922 : 0x0d141b, 0.96)
      .fillRect(x, y, 1780, 58);
    row
      .lineStyle(1, 0x41505b, 0.45)
      .lineBetween(x, y + 57.5, x + 1780, y + 57.5);
    if (ranked && rank <= 3) {
      const accent = rank === 1 ? 0xffd23f : rank === 2 ? 0x9ed2e4 : 0xd58a62;
      row.fillStyle(accent, 1).fillRect(x, y, 6, 58);
      row.fillStyle(accent, 0.14).fillRect(x + 6, y, 1774, 58);
    }

    this.add
      .text(118, y + 29, ranked ? String(rank).padStart(2, "0") : "--", {
        color:
          ranked && rank === 1 ? "#ffd23f" : ranked ? "#d9e3e9" : "#59656f",
        fontFamily: "Rajdhani",
        fontSize: "24px",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.add
      .text(250, y + 29, characterName, {
        color: ranked ? "#f0f4f7" : "#65727c",
        fontFamily: "Rajdhani",
        fontSize: "25px",
        fontStyle: "bold",
        letterSpacing: 1.1,
      })
      .setOrigin(0, 0.5);
    this.add
      .text(
        850,
        y + 29,
        record === undefined ? "--" : record.score.toLocaleString(),
        {
          color: ranked ? "#35c5f2" : "#59656f",
          fontFamily: "Rajdhani",
          fontSize: "24px",
          fontStyle: "bold",
        },
      )
      .setOrigin(0, 0.5);
    this.add
      .text(1120, y + 29, record === undefined ? "--" : `${record.wave}`, {
        color: ranked ? "#e2e8ec" : "#59656f",
        fontFamily: "Rajdhani",
        fontSize: "23px",
        fontStyle: "bold",
        letterSpacing: 0.8,
      })
      .setOrigin(0, 0.5);
    this.add
      .text(
        1350,
        y + 29,
        record === undefined ? "--" : `${record.difficulty.toFixed(2)}x`,
        {
          color: ranked ? "#aeb9c2" : "#59656f",
          fontFamily: "Rajdhani",
          fontSize: "18px",
          fontStyle: "bold",
          letterSpacing: 0.8,
        },
      )
      .setOrigin(0, 0.5);
    this.add
      .text(
        1590,
        y + 29,
        record === undefined
          ? "NO RECORD"
          : record.goddessFall
            ? "GODDESS FALL"
            : "STANDARD",
        {
          color:
            ranked && record?.goddessFall
              ? "#ffd23f"
              : ranked
                ? "#aeb9c2"
                : "#59656f",
          fontFamily: "Rajdhani",
          fontSize: "18px",
          fontStyle: "bold",
          letterSpacing: 0.8,
        },
      )
      .setOrigin(0, 0.5);
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
          previousScene: "records",
          revealTransition: true,
          transitionProfile,
        });
      },
      transitionProfile,
    );
  }
}

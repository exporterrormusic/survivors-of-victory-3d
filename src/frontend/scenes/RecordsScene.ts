import Phaser from "phaser";
import { bleed, pinToEdge, view } from "../rendering/DisplayQualityPlugin";

import { gameAudio, preloadLobbyAudio } from "../audio/GameAudio";
import { bindButtonInteraction } from "../ui/interaction/ButtonInteraction";
import { captureDevelopmentPreview } from "../dev/capturePreview";
import { CHARACTERS, characterLockReason } from "../profile/CharacterRoster";
import type { CharacterId } from "../profile/Ids";
import { OPERATION_ZONES } from "../profile/StageData";
import {
  loadSurvivalHistory,
  loadSurvivalMapNames,
  loadSurvivalStats,
  type SurvivalCharacterStats,
  type SurvivalRoundEntry,
} from "../profile/SurvivalStats";
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

const COLUMNS = [
  { label: "RANK", x: 100 },
  { label: "NIKKE", x: 180 },
  { label: "ROUNDS", x: 480 },
  { label: "WINS", x: 610 },
  { label: "FASTEST WIN", x: 790 },
  { label: "BEST ENDLESS", x: 960 },
  { label: "BEST KILLS", x: 1140 },
  { label: "BEST LEVEL", x: 1300 },
  { label: "BOSSES", x: 1450 },
  { label: "TIME PLAYED", x: 1570 },
  { label: "TOTAL KILLS", x: 1720 },
] as const;

interface CharacterRecord {
  readonly id: CharacterId;
  readonly locked: boolean;
  readonly name: string;
  readonly stats: SurvivalCharacterStats;
}

/** Played NIKKE first: most wins, then quickest win, longest endless, most kills. */
function compareRecords(left: CharacterRecord, right: CharacterRecord): number {
  const a = left.stats;
  const b = right.stats;
  const fastest = (s: SurvivalCharacterStats): number =>
    s.fastestWinSeconds > 0 ? s.fastestWinSeconds : Number.MAX_SAFE_INTEGER;
  return (
    b.wins - a.wins ||
    fastest(a) - fastest(b) ||
    b.bestEndlessSeconds - a.bestEndlessSeconds ||
    b.bestKills - a.bestKills ||
    b.rounds - a.rounds
  );
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}

/** Which column a new best lights up. */
const NEW_BEST_COLUMN = { win: 4, endless: 5, kills: 6, level: 7 } as const;

const ALL_MAPS = "ALL MAPS";
const RECENT = "RECENT";

const RECENT_COLUMNS = [
  { label: "WHEN", x: 100 },
  { label: "NIKKE", x: 300 },
  { label: "MAP", x: 600 },
  { label: "MODE", x: 900 },
  { label: "RESULT", x: 1040 },
  { label: "TIME", x: 1190 },
  { label: "KILLS", x: 1310 },
  { label: "LEVEL", x: 1440 },
  { label: "NEW BESTS", x: 1560 },
] as const;

const NEW_BEST_LABEL = {
  win: "FASTEST WIN",
  endless: "ENDLESS",
  kills: "KILLS",
  level: "LEVEL",
} as const;

function formatWhen(iso: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "JUST NOW";
  if (minutes < 60) return `${minutes}M AGO`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}H AGO`;
  return `${Math.floor(minutes / 1440)}D AGO`;
}

interface RecordsSceneData {
  readonly view?: string;
  /** a map tab swap: redraw in place, no fade from black */
  readonly tabSwap?: boolean;
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
  private view = ALL_MAPS;
  private tabSwap = false;

  public constructor() {
    super("records");
  }

  public init(data: RecordsSceneData = {}): void {
    this.leaving = false;
    this.previousScene = data.previousScene;
    this.revealTransition = data.revealTransition ?? false;
    this.transitionProfile = data.transitionProfile;
    this.view = data.view ?? ALL_MAPS;
    this.tabSwap = data.tabSwap ?? false;
  }

  public preload(): void {
    this.load.audio(AUDIO.select, "assets/audio/ui/select.wav");
    preloadLobbyAudio(this);
  }

  public create(): void {
    this.audioSettings = loadAudioSettings();
    const records = CHARACTERS.map(
      (character): CharacterRecord => ({
        id: character.id,
        locked: characterLockReason(character.id) !== undefined,
        name: character.name,
        stats: loadSurvivalStats(
          character.id,
          this.view === ALL_MAPS || this.view === RECENT ? undefined : this.view,
        ),
      }),
    ).sort(compareRecords);
    const history = loadSurvivalHistory();
    this.createBackdrop();
    this.createHeader(
      records.filter((record) => record.stats.rounds > 0).length,
    );
    this.createBackButton();
    this.createTabs();
    if (this.view === RECENT) this.createRecentTable(history);
    else this.createRecordsTable(records, history[0]);
    gameAudio.stopEnvironmentAmbience();
    gameAudio.playLobby(this);
    this.input.keyboard?.on("keydown-ESC", () => this.leave());

    if (this.revealTransition) {
      playHexWipeReveal(this, this.transitionProfile ?? "RECORDS");
      if (this.previousScene !== undefined) {
        this.scene.stop(this.previousScene);
      }
    } else if (!this.tabSwap) {
      this.cameras.main.fadeIn(260, 8, 13, 18);
    }
    captureDevelopmentPreview(this, "records");
  }

  private createBackdrop(): void {
    this.add.rectangle(bleed.left, 0, bleed.width, HEIGHT, 0x10171e).setOrigin(0);
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x8aa0ae, 0.065);
    for (let x = bleed.left - 420; x < bleed.right + 420; x += 205) {
      grid.lineBetween(x, 76, x + 430, HEIGHT - 48);
    }
    for (let y = 178; y < HEIGHT - 48; y += 108) {
      grid.lineBetween(bleed.left, y, bleed.right, y);
    }

    const chrome = this.add.graphics();
    chrome.fillStyle(0x080c11, 0.98).fillRect(bleed.left, 0, bleed.width, 76);
    chrome.fillRect(bleed.left, HEIGHT - 48, bleed.width, 48);
    chrome.fillStyle(0x35c5f2, 1).fillRect(bleed.left, 74, 515 - bleed.left, 3);
    chrome.fillStyle(0x65727e, 0.35).fillRect(515, 75, bleed.right - 515, 1);
    pinToEdge(this.add.text(view.left + 52, 25, "ARK SYSTEM / OPERATION RECORDS", {
      color: "#f2f5f7",
      fontFamily: "Rajdhani",
      fontSize: "26px",
      fontStyle: "bold",
      letterSpacing: 1.8,
    }), "left");
    pinToEdge(this.add.text(view.right - 146, 26, "04", {
      color: "#9aa4af",
      fontFamily: "Rajdhani",
      fontSize: "25px",
      fontStyle: "bold",
    }), "right");
    pinToEdge(this.add.text(view.left + 52, 1038, "LOCAL RECORDS // SURVIVAL ROUNDS", {
      color: "#8a949f",
      fontFamily: "Rajdhani",
      fontSize: "15px",
      fontStyle: "bold",
      letterSpacing: 2,
    }), "left");
    pinToEdge(this.add
      .text(view.right - 102, 1038, "WINS DESC // FASTEST WIN ASC", {
        color: "#35c5f2",
        fontFamily: "Rajdhani",
        fontSize: "15px",
        fontStyle: "bold",
        letterSpacing: 1.5,
      }), "right")
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
      "LOCAL PERSONAL BESTS // EVERY FINISHED ROUND COUNTS",
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

  private createTabs(): void {
    const maps = new Set([
      ...OPERATION_ZONES.map((zone) => zone.name),
      ...loadSurvivalMapNames(),
    ]);
    let x = 70;
    [ALL_MAPS, ...maps, RECENT].forEach((view) => {
      const active = view === this.view;
      const surface = this.add.graphics();
      const label = this.add
        .text(x + 14, 238, view, {
          color: active ? "#10171e" : "#9aa7b1",
          fontFamily: "Rajdhani",
          fontSize: "15px",
          fontStyle: "bold",
          letterSpacing: 1.4,
        })
        .setOrigin(0, 0.5);
      const left = x;
      const width = label.width + 28;
      const draw = (hovered: boolean): void => {
        surface.clear();
        surface
          .fillStyle(active ? 0x35c5f2 : hovered ? 0x263641 : 0x182129, 1)
          .fillRect(left, 226, width, 24);
      };
      draw(false);
      const hit = this.add
        .rectangle(left, 226, width, 24, 0xffffff, 0)
        .setOrigin(0);
      bindButtonInteraction(hit, {
        draw,
        onActivate: () => {
          if (!active) this.scene.restart({ view, tabSwap: true });
        },
        onHover: () =>
          this.sound.play(AUDIO.select, {
            volume: scaledSfxVolume(0.14, this.audioSettings),
          }),
      });
      x += width + 6;
    });
  }

  private createRecentTable(history: readonly SurvivalRoundEntry[]): void {
    this.createTableFrame(RECENT_COLUMNS);
    if (history.length === 0) {
      this.add
        .text(960, 600, "NO ROUNDS PLAYED YET", {
          color: "#59656f",
          fontFamily: "Rajdhani",
          fontSize: "24px",
          fontStyle: "bold",
          letterSpacing: 2,
        })
        .setOrigin(0.5);
      return;
    }
    history.forEach((entry, index) => {
      const y = 316 + index * 58;
      const row = this.add.graphics();
      row
        .fillStyle(index % 2 === 0 ? 0x111922 : 0x0d141b, 0.96)
        .fillRect(70, y, 1780, 58);
      row
        .lineStyle(1, 0x41505b, 0.45)
        .lineBetween(70, y + 57.5, 1850, y + 57.5);
      const name =
        CHARACTERS.find((character) => character.id === entry.characterId)
          ?.name ?? entry.characterId;
      const values: readonly (readonly [string, string])[] = [
        [formatWhen(entry.finishedAt), "#85939e"],
        [name, "#f0f4f7"],
        [entry.mapName || "--", "#aeb9c2"],
        [entry.endless ? "ENDLESS" : "WAVE", "#aeb9c2"],
        [entry.won ? "WIN" : "LOSS", entry.won ? "#35c5f2" : "#d58a62"],
        [formatTime(entry.seconds), "#e2e8ec"],
        [entry.kills.toLocaleString(), "#e2e8ec"],
        [String(entry.level), "#e2e8ec"],
        [
          entry.newBests.map((best) => NEW_BEST_LABEL[best]).join(" · ") ||
            "--",
          entry.newBests.length > 0 ? "#ffd23f" : "#59656f",
        ],
      ];
      values.forEach(([value, color], column) => {
        this.add
          .text(RECENT_COLUMNS[column]!.x, y + 29, value, {
            color,
            fontFamily: "Rajdhani",
            fontSize: "22px",
            fontStyle: "bold",
            letterSpacing: 0.8,
          })
          .setOrigin(0, 0.5);
      });
    });
  }

  private createTableFrame(
    columns: readonly { readonly label: string; readonly x: number }[],
  ): void {
    const table = this.add.graphics();
    table.fillStyle(0x0b1016, 0.96).fillRect(70, 258, 1780, 704);
    table.lineStyle(1, 0x46545f, 1).strokeRect(70.5, 258.5, 1779, 703);
    table.fillStyle(0x202b34, 1).fillRect(70, 258, 1780, 58);
    table.fillStyle(0x35c5f2, 1).fillRect(70, 312, 1780, 4);
    columns.forEach(({ label, x }) => {
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
  }

  private createRecordsTable(
    records: readonly CharacterRecord[],
    latest: SurvivalRoundEntry | undefined,
  ): void {
    const ranked = records.filter((record) => record.stats.rounds > 0);
    const ordered = [
      ...ranked,
      ...records.filter((record) => record.stats.rounds === 0),
    ];
    // Leave room for the totals row at the bottom.
    const rowHeight = Math.min(
      58,
      Math.floor(592 / Math.max(1, ordered.length)),
    );
    this.createTableFrame(COLUMNS);
    // The latest round's new bests, shown only where that round counts.
    const fresh =
      latest !== undefined &&
      (this.view === ALL_MAPS || this.view === latest.mapName)
        ? latest
        : undefined;

    ordered.forEach((record, index) => {
      const rank = ranked.indexOf(record);
      this.createRecordRow(
        record,
        rank >= 0 ? rank + 1 : undefined,
        316 + index * rowHeight,
        rowHeight,
        index,
        fresh?.characterId === record.id ? fresh.newBests : [],
      );
    });
    this.createTotalsRow(ranked);
  }

  private createTotalsRow(records: readonly CharacterRecord[]): void {
    const y = 908;
    const sum = (key: keyof SurvivalCharacterStats): number =>
      records.reduce((total, record) => total + Number(record.stats[key]), 0);
    const best = (key: keyof SurvivalCharacterStats): number =>
      Math.max(0, ...records.map((record) => Number(record.stats[key])));
    const fastest = Math.min(
      ...records
        .map((record) => record.stats.fastestWinSeconds)
        .filter((seconds) => seconds > 0),
    );
    const rounds = sum("rounds");
    const wins = sum("wins");
    const bar = this.add.graphics();
    bar.fillStyle(0x202b34, 1).fillRect(70, y, 1780, 54);
    bar.fillStyle(0x35c5f2, 1).fillRect(70, y, 1780, 2);
    const values: readonly string[] = [
      "",
      "ALL NIKKE",
      rounds > 0 ? rounds.toLocaleString() : "--",
      wins > 0 ? `${wins} · ${Math.round((wins / rounds) * 100)}%` : "--",
      Number.isFinite(fastest) ? formatTime(fastest) : "--",
      best("bestEndlessSeconds") > 0
        ? formatTime(best("bestEndlessSeconds"))
        : "--",
      best("bestKills") > 0 ? best("bestKills").toLocaleString() : "--",
      best("bestLevel") > 0 ? String(best("bestLevel")) : "--",
      sum("bossesDefeated") > 0 ? String(sum("bossesDefeated")) : "--",
      sum("totalSeconds") > 0 ? formatDuration(sum("totalSeconds")) : "--",
      sum("totalKills") > 0 ? sum("totalKills").toLocaleString() : "--",
    ];
    values.forEach((value, column) => {
      this.add
        .text(COLUMNS[column]!.x, y + 28, value, {
          color: column === 1 ? "#35c5f2" : "#dce3e8",
          fontFamily: "Rajdhani",
          fontSize: "21px",
          fontStyle: "bold",
          letterSpacing: 1,
        })
        .setOrigin(0, 0.5);
    });
  }

  private createRecordRow(
    record: CharacterRecord,
    rank: number | undefined,
    y: number,
    height: number,
    index: number,
    newBests: readonly SurvivalRoundEntry["newBests"][number][],
  ): void {
    const x = 70;
    const freshColumns = new Set<number>(
      newBests.map((best) => NEW_BEST_COLUMN[best]),
    );
    const mid = y + height / 2;
    const row = this.add.graphics();
    const ranked = rank !== undefined;
    row
      .fillStyle(index % 2 === 0 ? 0x111922 : 0x0d141b, 0.96)
      .fillRect(x, y, 1780, height);
    row
      .lineStyle(1, 0x41505b, 0.45)
      .lineBetween(x, y + height - 0.5, x + 1780, y + height - 0.5);
    if (ranked && rank <= 3) {
      const accent = rank === 1 ? 0xffd23f : rank === 2 ? 0x9ed2e4 : 0xd58a62;
      row.fillStyle(accent, 1).fillRect(x, y, 6, height);
      row.fillStyle(accent, 0.14).fillRect(x + 6, y, 1774, height);
    }

    const dim = "#59656f";
    const cell = (
      column: number,
      value: string,
      color: string,
      size = 22,
    ): void => {
      const text = this.add
        .text(COLUMNS[column].x, mid, value, {
          color,
          fontFamily: "Rajdhani",
          fontSize: `${Math.min(size, height - 18)}px`,
          fontStyle: "bold",
          letterSpacing: 0.8,
        })
        .setOrigin(0, 0.5);
      if (freshColumns.has(column))
        this.add
          .text(text.x + text.width + 6, mid, "NEW", {
            backgroundColor: "#ffd23f",
            color: "#10171e",
            fontFamily: "Rajdhani",
            fontSize: "13px",
            fontStyle: "bold",
            padding: { x: 4, y: 1 },
          })
          .setOrigin(0, 0.5);
    };
    const { stats } = record;
    const number = (value: number): string =>
      ranked && value > 0 ? value.toLocaleString() : "--";
    const time = (seconds: number): string =>
      ranked && seconds > 0 ? formatTime(seconds) : "--";

    cell(
      0,
      ranked ? String(rank).padStart(2, "0") : "--",
      ranked && rank === 1 ? "#ffd23f" : ranked ? "#d9e3e9" : dim,
      24,
    );
    cell(
      1,
      record.name,
      ranked ? "#f0f4f7" : record.locked ? "#3f4a53" : "#65727c",
      25,
    );
    if (!ranked) {
      cell(2, record.locked ? "COMING SOON" : "NO ROUNDS PLAYED", dim, 18);
      return;
    }
    cell(2, number(stats.rounds), "#e2e8ec");
    cell(
      3,
      stats.wins > 0
        ? `${stats.wins} · ${Math.round((stats.wins / stats.rounds) * 100)}%`
        : "--",
      stats.wins > 0 ? "#35c5f2" : dim,
    );
    cell(4, time(stats.fastestWinSeconds), stats.fastestWinSeconds > 0 ? "#ffd23f" : dim);
    cell(5, time(stats.bestEndlessSeconds), "#aeb9c2");
    cell(6, number(stats.bestKills), "#e2e8ec");
    cell(7, number(stats.bestLevel), "#e2e8ec");
    cell(8, number(stats.bossesDefeated), "#e2e8ec");
    cell(9, stats.totalSeconds > 0 ? formatDuration(stats.totalSeconds) : "--", "#aeb9c2");
    cell(10, number(stats.totalKills), "#aeb9c2");
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

// Multiplayer: create a lobby (room code, no accounts) or join one by code, then a co-op lobby.
// Smash-style player cards (portrait, NIKKE, skin, ready) in the Character Select look, over the
// host's map as in Mission Select. Only the host picks the map and mode; START hands the open
// session to the match (src/net/coop-handoff.ts), so nobody joins twice. Logic: src/net/lobby.ts.

import Phaser from "phaser";
import { bleed, pinToEdge, view } from "../rendering/DisplayQualityPlugin";
import { gameAudio, preloadLobbyAudio } from "../audio/GameAudio";
import { captureDevelopmentPreview } from "../dev/capturePreview";
import { deployMatch } from "../handoff";
import {
  CHARACTERS,
  characterLockReason,
  loadRosterState,
  saveSelectedCharacter,
  type CharacterDefinition,
} from "../profile/CharacterRoster";
import type { CharacterId } from "../profile/Ids";
import { characterSkins, equipSkin, equippedSkin, ownsSkin } from "../profile/Skins";
import {
  MISSION_MODES,
  OPERATION_ZONES,
  operationZone,
  type MissionModeId,
  type OperationZoneDefinition,
  type StageSelection,
} from "../profile/StageData";
import {
  nextNikkeTransitionProfile,
  playHexWipeCover,
  playHexWipeReveal,
  type HexWipeProfile,
} from "../ui/transitions/HexWipeTransition";
import { ZoneAmbience } from "../ui/ZoneAmbience";
import { handOffCoop } from "../../net/coop-handoff";
import { LobbyGuest, LobbyHost, type LobbyPlayer, type LobbyStage, type LobbyState } from "../../net/lobby";
import { DEFAULT_MAX_PLAYERS, type RejectReason } from "../../net/protocol";
import { generateRoomCode, normalizeRoomCode } from "../../net/room-code";
import { CoopGuest, CoopHost } from "../../net/session";
import { joinTrysteroRoom } from "../../net/trystero-transport";

const WIDTH = 1920;
const HEIGHT = 1080;
const CYAN = 0x35c5f2;
const YELLOW = 0xffd23f;
const GREEN = 0x3ccf8e;
const FONT = "Rajdhani";
const CARD = { x: 604, y: 300, width: 404, height: 548, gap: 26 };
const PORTRAIT_HEIGHT = 330;
/** characters the co-op match can field */
const PLAYABLE = CHARACTERS.filter((c) => characterLockReason(c.id) === undefined);

interface SceneData {
  readonly previousScene?: string;
  readonly revealTransition?: boolean;
  readonly transitionProfile?: HexWipeProfile;
}

type Phase = "menu" | "joining" | "lobby";

const REJECTS: Readonly<Record<RejectReason | "no-host" | "host-left", string>> = {
  full: "THAT LOBBY IS FULL",
  started: "THAT MATCH HAS ALREADY STARTED",
  version: "THE HOST IS ON A DIFFERENT GAME VERSION",
  "no-host": "NO LOBBY FOUND WITH THAT CODE",
  "host-left": "THE HOST CLOSED THE LOBBY",
};

const text = (size: number, color = "#f2f5f7", spacing = 1.5): Phaser.Types.GameObjects.Text.TextStyle => ({
  color, fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", letterSpacing: spacing,
});

/** The menus' angled panel: square corners but a clipped bottom-right. */
function panel(x: number, y: number, w: number, h: number, cut = 14): Phaser.Math.Vector2[] {
  return [
    new Phaser.Math.Vector2(x, y), new Phaser.Math.Vector2(x + w, y), new Phaser.Math.Vector2(x + w, y + h - cut),
    new Phaser.Math.Vector2(x + w - cut, y + h), new Phaser.Math.Vector2(x, y + h),
  ];
}

export class MultiplayerScene extends Phaser.Scene {
  private phase: Phase = "menu";
  private previousScene?: string;
  private revealTransition = false;
  private transitionProfile?: HexWipeProfile;
  private leaving = false;
  private layer?: Phaser.GameObjects.Container;
  private background?: Phaser.GameObjects.Image;
  private shade?: Phaser.GameObjects.Rectangle;
  private ambience?: ZoneAmbience;
  private typed = "";
  private notice = "";
  private copied = 0;
  private host: LobbyHost | null = null;
  private guest: LobbyGuest | null = null;
  private code = "";
  private character: CharacterDefinition = PLAYABLE[0]!;
  private skin = "";
  private zoneIndex = 0;
  private modeId: MissionModeId = MISSION_MODES[0]!.id;
  /** a redraw is due (network changes arrive between frames) */
  private dirty = false;
  private readonly onKey = (event: KeyboardEvent): void => this.key(event);
  private readonly onPaste = (event: ClipboardEvent): void => {
    if (this.phase !== "menu") return;
    this.typed = (event.clipboardData?.getData("text") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    this.render();
  };

  public constructor() {
    super("multiplayer");
  }

  public init(data: SceneData = {}): void {
    this.previousScene = data.previousScene;
    this.revealTransition = data.revealTransition ?? false;
    this.transitionProfile = data.transitionProfile;
  }

  public preload(): void {
    preloadLobbyAudio(this);
    for (const character of PLAYABLE) {
      this.load.image(this.portraitKey(character.id), character.portraitPath);
      for (const skin of characterSkins(character.id)) this.load.image(`mp-skin-${skin.id}`, skin.icon);
    }
    for (const zone of OPERATION_ZONES) this.load.image(this.zoneKey(zone.id), zone.previewPath);
  }

  public create(): void {
    this.phase = "menu";
    this.leaving = false;
    this.typed = "";
    this.notice = "";
    this.host = this.guest = null;
    const roster = loadRosterState();
    this.character = PLAYABLE.find((c) => c.id === roster.selectedCharacterId) ?? PLAYABLE[0]!;
    this.skin = equippedSkin(this.character.id)?.id ?? "";

    // A random zone each visit: the backdrop, and the host's first pick.
    this.zoneIndex = Math.floor(Math.random() * OPERATION_ZONES.length);
    this.background = this.add.image(WIDTH / 2, HEIGHT / 2, this.zoneKey(OPERATION_ZONES[this.zoneIndex]!.id));
    this.fitBackground();
    this.shade = this.add.rectangle(bleed.left, 0, bleed.width, HEIGHT, 0x060a0f, 0.62).setOrigin(0);
    this.ambience = new ZoneAmbience(this, 5, this.background);
    this.createChrome();
    this.render();
    this.reopenLobby();

    // The browser's own key events: Phaser's queued ones can arrive out of step when typed fast.
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("paste", this.onPaste);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", this.onKey);
      window.removeEventListener("paste", this.onPaste);
      this.ambience?.destroy();
    });
    gameAudio.playLobby(this);
    if (this.revealTransition) {
      playHexWipeReveal(this, this.transitionProfile ?? "SQUAD LINK");
      if (this.previousScene !== undefined) this.scene.stop(this.previousScene);
    } else {
      this.cameras.main.fadeIn(260, 8, 13, 18);
    }
    captureDevelopmentPreview(this, "multiplayer");
  }

  public update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.host?.update(dt);
    this.guest?.update(dt);
    if (this.copied > 0 && (this.copied -= dt) <= 0) this.dirty = true;
    if (this.dirty) { this.dirty = false; this.render(); }
    // Read-only status for scripted checks (tools/, like coop-test's window.coopTest).
    (window as unknown as { coopLobby: unknown }).coopLobby = { phase: this.phase, code: this.code, notice: this.notice, state: this.state };
  }

  // --- networking ------------------------------------------------------------------------------

  private createLobby(code = generateRoomCode()): void {
    this.code = code;
    const session = new CoopHost(joinTrysteroRoom(this.code), { name: "PLAYER", character: this.character.id });
    this.host = new LobbyHost(session, { character: this.character.id, skin: this.skin, ready: true }, this.stage());
    this.host.onChange = () => { this.dirty = true; };
    this.phase = "lobby";
    gameAudio.playUi(this, "confirm");
    this.render();
  }

  /** From a co-op round's results (?lobby=host|join&room=CODE): the same room again, by its code. */
  private reopenLobby(): void {
    const params = new URLSearchParams(window.location.search);
    const role = params.get("lobby"), code = normalizeRoomCode(params.get("room") ?? "");
    if (!role || !code) return;
    params.delete("lobby"); params.delete("room");
    history.replaceState(null, "", `${window.location.pathname}?${params}`);
    if (role === "host") this.createLobby(code);
    else if (role === "join") { this.typed = code; this.joinLobby(); }
  }

  private joinLobby(): void {
    const code = normalizeRoomCode(this.typed);
    if (!code) { this.notice = "ENTER THE 6-CHARACTER ROOM CODE"; this.render(); return; }
    this.code = code;
    const session = new CoopGuest(joinTrysteroRoom(code), { name: "PLAYER", character: this.character.id }, { timeoutMs: 45000 });
    const guest = this.guest = new LobbyGuest(session, { character: this.character.id, skin: this.skin });
    session.onJoined = () => { if (this.guest === guest) { this.phase = "lobby"; this.dirty = true; } };
    session.onRejected = (reason) => this.dropToMenu(REJECTS[reason]);
    session.onLost = (reason) => this.dropToMenu(REJECTS[reason]);
    guest.onChange = () => { this.dirty = true; };
    guest.onStart = (state) => this.deploy(state, "join");
    this.phase = "joining";
    this.notice = "";
    gameAudio.playUi(this, "confirm");
    this.render();
  }

  /** Leave the lobby (closing it, for the host) and go back to Create / Join. */
  private leaveLobby(): void {
    const session = this.host?.session ?? this.guest?.session;
    this.host = this.guest = null;
    void session?.close();
    this.phase = "menu";
    this.render();
  }

  private dropToMenu(message: string): void {
    if (!this.guest || this.leaving) return;
    this.leaveLobby();
    this.notice = message;
    this.dirty = true;
  }

  private start(): void {
    if (!this.host || this.leaving) return;
    this.deploy(this.host.start(), "host");
  }

  private deploy(state: LobbyState, role: "host" | "join"): void {
    if (this.leaving) return;
    this.leaving = true;
    this.input.enabled = false;
    const zone = operationZone(state.stage.zoneId);
    const stageSelection: StageSelection = {
      biome: zone.biome, difficulty: 1, goddessFall: false,
      modeId: state.stage.modeId as MissionModeId, time: zone.time, zoneId: zone.id,
    };
    if (this.host) handOffCoop({ role: "host", code: this.code, lobby: this.host });
    else if (this.guest) handOffCoop({ role: "guest", code: this.code, lobby: this.guest });
    gameAudio.playUi(this, "confirm");
    playHexWipeCover(this, () => {
      gameAudio.stopMusic();
      deployMatch({ characterId: this.character.id, stageSelection, coop: { role, code: this.code } });
    }, nextNikkeTransitionProfile());
  }

  private stage(): LobbyStage {
    const zone = OPERATION_ZONES[this.zoneIndex] ?? OPERATION_ZONES[0]!;
    return { zoneId: zone.id, time: zone.time, modeId: this.modeId };
  }

  private get state(): LobbyState | null {
    return this.host?.state ?? this.guest?.state ?? null;
  }

  private get mySlot(): number {
    return this.host ? 0 : this.guest?.session.slot ?? -1;
  }

  // --- picks -----------------------------------------------------------------------------------

  private pickCharacter(character: CharacterDefinition): void {
    if (this.myReady && this.guest) return;
    this.character = character;
    this.skin = equippedSkin(character.id)?.id ?? "";
    saveSelectedCharacter(character.id);
    gameAudio.playUi(this, "select");
    this.sendPick();
  }

  private pickSkin(id: string): void {
    if (this.myReady && this.guest) return;
    const skin = characterSkins(this.character.id).find((s) => s.id === id);
    if (!skin || !ownsSkin(skin)) return;
    // The match dresses the local hero in the equipped skin.
    equipSkin(skin);
    this.skin = skin.id;
    gameAudio.playUi(this, "select");
    this.sendPick();
  }

  private get myReady(): boolean { return this.guest?.pick.ready ?? true; }

  private toggleReady(): void {
    if (!this.guest) return;
    gameAudio.playUi(this, "confirm");
    this.guest.setPick({ ready: !this.guest.pick.ready });
  }

  private sendPick(): void {
    if (this.host) this.host.setPick({ character: this.character.id, skin: this.skin });
    else this.guest?.setPick({ character: this.character.id, skin: this.skin });
    this.render();
  }

  private stepZone(step: number): void {
    if (!this.host) return;
    this.zoneIndex = (this.zoneIndex + step + OPERATION_ZONES.length) % OPERATION_ZONES.length;
    gameAudio.playUi(this, "select");
    this.host.setStage(this.stage());
  }

  private pickMode(id: MissionModeId): void {
    if (!this.host || this.modeId === id) return;
    this.modeId = id;
    gameAudio.playUi(this, "select");
    this.host.setStage(this.stage());
  }

  // --- input -----------------------------------------------------------------------------------

  private key(event: KeyboardEvent): void {
    if (this.leaving) return;
    if (event.key === "Escape") { this.back(); return; }
    if (this.phase !== "menu") return;
    if (event.key === "Enter") { this.joinLobby(); return; }
    if (event.key === "Backspace") this.typed = this.typed.slice(0, -1);
    else if (/^[a-z0-9]$/i.test(event.key) && this.typed.length < 6) this.typed += event.key.toUpperCase();
    else return;
    this.notice = "";
    this.render();
  }

  private back(): void {
    if (this.leaving) return;
    gameAudio.playUi(this, "back");
    if (this.phase !== "menu") { this.leaveLobby(); return; }
    this.leaving = true;
    this.input.enabled = false;
    const transitionProfile = nextNikkeTransitionProfile();
    playHexWipeCover(this, () => {
      this.scene.launch("main-menu", { previousScene: "multiplayer", revealTransition: true, transitionProfile });
    }, transitionProfile);
  }

  // --- drawing ---------------------------------------------------------------------------------

  private render(): void {
    this.layer?.destroy();
    this.layer = this.add.container(0, 0).setDepth(20);
    const state = this.state;
    const zone = state ? operationZone(state.stage.zoneId) : OPERATION_ZONES[this.zoneIndex]!;
    if (this.background && this.textures.exists(this.zoneKey(zone.id))) {
      this.background.setTexture(this.zoneKey(zone.id));
      this.fitBackground();
    }
    this.ambience?.set(zone.id);
    this.shade?.setAlpha(this.phase === "lobby" ? 0.6 : 0.74);
    this.button(1700, 98, 168, 58, "BACK", () => this.back(), "dark", 24);
    if (this.phase === "lobby") this.renderLobby(state, zone);
    else this.renderMenu();
  }

  private createChrome(): void {
    const chrome = this.add.graphics().setDepth(60);
    chrome.fillStyle(0x090d12, 0.97);
    chrome.fillRect(bleed.left, 0, bleed.width, 76);
    chrome.fillRect(bleed.left, HEIGHT - 48, bleed.width, 48);
    chrome.fillStyle(CYAN, 1);
    chrome.fillRect(bleed.left, 74, 515 - bleed.left, 3);
    chrome.fillStyle(0xaeb7c1, 0.28);
    chrome.fillRect(515, 75, bleed.right - 515, 1);
    pinToEdge(this.add.text(view.left + 52, 25, "ARK SYSTEM / SQUAD LINK", text(26, "#f2f5f7", 1.8)), "left").setDepth(61);
    pinToEdge(this.add.text(view.right - 146, 26, "04", text(25, "#9aa4af")), "right").setDepth(61);
    pinToEdge(this.add.text(view.left + 52, 1038, "CO-OP // PEER TO PEER // NO ACCOUNT", text(15, "#8a949f", 2)), "left").setDepth(61);
    pinToEdge(this.add.text(view.right - 52, 1038, `UP TO ${DEFAULT_MAX_PLAYERS} OPERATIVES`, text(15, "#35c5f2", 1.5)), "right").setOrigin(1, 0).setDepth(61);
  }

  private heading(title: string, subtitle: string): void {
    const l = this.layer!;
    l.add(this.add.text(56, 100, title, text(56, "#f2f5f7", 2)));
    l.add(this.add.text(59, 161, subtitle, text(17, "#aeb7c1", 2.5)));
    const rule = this.add.graphics();
    rule.fillStyle(CYAN, 1); rule.fillRect(59, 188, 80, 3);
    rule.fillStyle(0xaeb7c1, 0.24); rule.fillRect(139, 189, 420, 1);
    l.add(rule);
  }

  private renderMenu(): void {
    this.heading("MULTIPLAYER", "CO-OP SURVIVAL // ROOM CODES, NO ACCOUNT");
    const l = this.layer!;
    const joining = this.phase === "joining";

    // Create
    const create = this.add.container(56, 300);
    const cg = this.add.graphics();
    cg.fillStyle(0xf3f6f8, joining ? 0.4 : 0.96).fillPoints(panel(0, 0, 640, 300, 20), true);
    cg.fillStyle(CYAN, 1).fillRect(0, 0, 6, 300);
    create.add([cg,
      this.add.text(44, 46, "CREATE LOBBY", text(48, "#20262d", 2)),
      this.add.text(46, 108, "HOST A ROOM // SHARE THE CODE", text(17, "#65717c", 2.2)),
      this.add.text(46, 160, "You pick the map and mode. Friends join with your\nroom code, choose their NIKKE and ready up.", { ...text(20, "#3c4650", 0.4), fontStyle: "normal", lineSpacing: 6 }),
    ]);
    if (!joining) this.hit(create, 640, 300, () => this.createLobby(), cg);
    l.add(create);

    // Join
    const join = this.add.container(740, 300);
    const jg = this.add.graphics();
    jg.fillStyle(0x0d151d, 0.92).fillPoints(panel(0, 0, 640, 300, 20), true);
    jg.lineStyle(1, 0x55636f, 1).strokePoints(panel(0, 0, 640, 300, 20), true, true);
    jg.fillStyle(YELLOW, 1).fillRect(0, 0, 6, 300);
    join.add([jg,
      this.add.text(44, 46, "JOIN LOBBY", text(48, "#f2f5f7", 2)),
      this.add.text(46, 108, joining ? "CONNECTING..." : "TYPE OR PASTE A ROOM CODE", text(17, joining ? "#ffd23f" : "#aeb7c1", 2.2)),
    ]);
    const shown = this.typed.padEnd(6, "_");
    for (let i = 0; i < 6; i++) {
      const x = 46 + i * 62 + (i >= 3 ? 26 : 0);
      const box = this.add.graphics();
      box.fillStyle(0x182430, 1).fillRect(x, 160, 52, 72);
      box.lineStyle(2, i === this.typed.length && !joining ? CYAN : 0x3b4955, 1).strokeRect(x, 160, 52, 72);
      join.add([box, this.add.text(x + 26, 196, shown[i] === "_" ? "" : shown[i]!, text(44, "#f2f5f7", 0)).setOrigin(0.5)]);
    }
    join.add(this.add.text(46 + 3 * 62 + 1, 196, "-", text(40, "#55636f", 0)).setOrigin(0, 0.5));
    l.add(join);
    if (!joining) {
      this.button(740 + 456, 300 + 160, 150, 72, "JOIN", () => this.joinLobby(), this.typed.length === 6 ? "cyan" : "dark", 30, join);
    }
    if (this.notice) l.add(this.add.text(740, 630, this.notice, text(22, "#ff8a80", 2)));
    l.add(this.add.text(56, 640, "Joining shares your connection with the other players directly (WebRTC).\nSome school or work networks block it.", { ...text(17, "#8a949f", 0.4), fontStyle: "normal", lineSpacing: 5 }));
  }

  private renderLobby(state: LobbyState | null, zone: OperationZoneDefinition): void {
    const l = this.layer!;
    this.heading("LOBBY", this.host ? "YOU ARE HOSTING // SHARE THE CODE" : "JOINED // WAITING FOR THE HOST");
    // Room code (click to copy)
    const code = this.add.container(56, 214);
    const cg = this.add.graphics();
    cg.fillStyle(0x0d151d, 0.9).fillPoints(panel(0, 0, 480, 92, 14), true);
    cg.fillStyle(YELLOW, 1).fillRect(0, 0, 4, 92);
    code.add([cg,
      this.add.text(24, 14, this.copied > 0 ? "COPIED TO CLIPBOARD" : "ROOM CODE // CLICK TO COPY", text(14, this.copied > 0 ? "#3ccf8e" : "#aeb7c1", 2)),
      this.add.text(22, 34, this.code, text(46, "#ffd23f", 6)),
    ]);
    this.hit(code, 480, 92, () => {
      void navigator.clipboard?.writeText(this.code).catch(() => {});
      this.copied = 2;
      gameAudio.playUi(this, "select");
      this.render();
    }, cg);
    l.add(code);

    // Mode
    l.add(this.add.text(58, 334, this.host ? "MODE" : "MODE // HOST'S PICK", text(15, "#aeb7c1", 2.2)));
    MISSION_MODES.forEach((mode, i) => {
      const chosen = (state?.stage.modeId ?? this.modeId) === mode.id;
      const c = this.add.container(56 + i * 246, 360);
      const g = this.add.graphics();
      g.fillStyle(chosen ? 0x123a50 : 0x0d151d, chosen ? 0.95 : 0.82).fillPoints(panel(0, 0, 234, 74, 12), true);
      if (chosen) g.fillStyle(CYAN, 1).fillRect(0, 0, 4, 74);
      c.add([g, this.add.text(20, 20, mode.name, text(30, chosen ? "#35c5f2" : "#f2f5f7", 1.5))]);
      if (this.host) this.hit(c, 234, 74, () => this.pickMode(mode.id), g);
      l.add(c);
    });
    const mode = MISSION_MODES.find((m) => m.id === (state?.stage.modeId ?? this.modeId));
    if (mode) l.add(this.add.text(58, 446, mode.description, { ...text(17, "#c6ced5", 0.3), fontStyle: "normal", wordWrap: { width: 480 } }));

    // Map
    l.add(this.add.text(58, 520, this.host ? "OPERATION ZONE" : "OPERATION ZONE // HOST'S PICK", text(15, "#aeb7c1", 2.2)));
    const thumb = this.add.image(56, 548, this.zoneKey(zone.id)).setOrigin(0);
    if (this.textures.exists(this.zoneKey(zone.id))) thumb.setDisplaySize(480, 270);
    const frame = this.add.graphics();
    frame.lineStyle(3, YELLOW, 1).strokeRect(56, 548, 480, 270);
    frame.fillStyle(0x060a0f, 0.72).fillRect(56, 758, 480, 60);
    l.add([thumb, frame,
      this.add.text(76, 766, zone.name, text(28, "#f2f5f7", 1.5)),
      this.add.text(516, 776, zone.subtitle, text(15, "#35c5f2", 2)).setOrigin(1, 0)]);
    if (this.host) {
      this.button(56, 830, 72, 56, "<", () => this.stepZone(-1), "dark", 30);
      this.button(464, 830, 72, 56, ">", () => this.stepZone(1), "dark", 30);
      l.add(this.add.text(296, 858, `ZONE ${String(this.zoneIndex + 1).padStart(2, "0")} // ${String(OPERATION_ZONES.length).padStart(2, "0")}`, text(16, "#aeb7c1", 2)).setOrigin(0.5));
    }

    // Character strip (yours)
    l.add(this.add.text(CARD.x, 104, "SELECT YOUR NIKKE", text(15, "#aeb7c1", 2.2)));
    PLAYABLE.forEach((character, i) => {
      const x = CARD.x + i * 112, y = 130;
      const chosen = character.id === this.character.id;
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(0x101820, 0.9).fillRect(0, 0, 100, 140);
      const img = this.add.image(0, 0, this.portraitKey(character.id));
      this.cover(img, 4, 4, 92, 132);
      c.add([g, img]);
      const outline = this.add.graphics();
      if (chosen) outline.lineStyle(3, 0xf2f5f7, 1).strokeRect(0, 0, 100, 140);
      else img.setAlpha(0.6);
      c.add(outline);
      this.hit(c, 100, 140, () => this.pickCharacter(character), outline);
      l.add(c);
    });

    // Player cards
    const players = state?.players ?? [];
    for (let i = 0; i < DEFAULT_MAX_PLAYERS; i++) this.playerCard(i, players.find((p) => p.slot === i) ?? null);

    // Footer: status and the big action
    const waiting = players.filter((p) => !p.ready).length;
    const status = !state ? "CONNECTING..." : this.host
      ? players.length < 2 ? "SHARE THE CODE // OR START ALONE" : waiting ? `WAITING FOR ${waiting} PLAYER${waiting > 1 ? "S" : ""} TO READY` : "ALL READY"
      : this.myReady ? "READY // WAITING FOR THE HOST TO START" : "PICK YOUR NIKKE, THEN READY UP";
    l.add(this.add.text(CARD.x, 902, status, text(22, waiting && this.host ? "#ffd23f" : "#f2f5f7", 2)));
    l.add(this.add.text(CARD.x, 934, `${players.length} / ${DEFAULT_MAX_PLAYERS} PLAYERS`, text(15, "#aeb7c1", 2)));
    const actionX = CARD.x + 2 * (CARD.width + CARD.gap);
    if (this.host) {
      const canStart = !!state && this.host.allReady;
      this.button(actionX, 888, CARD.width, 84, "MISSION START", () => { if (canStart) this.start(); }, canStart ? "cyan" : "dark", 32);
    } else {
      this.button(actionX, 888, CARD.width, 84, this.myReady ? "NOT READY" : "READY", () => this.toggleReady(), this.myReady ? "dark" : "cyan", 32);
    }
  }

  private playerCard(slot: number, player: LobbyPlayer | null): void {
    const l = this.layer!;
    const x = CARD.x + slot * (CARD.width + CARD.gap), y = CARD.y, w = CARD.width, h = CARD.height;
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    l.add(c);
    if (!player) {
      g.fillStyle(0x0d151d, 0.6).fillPoints(panel(0, 0, w, h, 18), true);
      g.lineStyle(2, 0x55636f, 0.9);
      for (let d = 0; d < 2 * (w + h); d += 22) {
        // dashed outline
        const p = (t: number) => t < w ? [t, 0] : t < w + h ? [w, t - w] : t < 2 * w + h ? [w - (t - w - h), h] : [0, h - (t - 2 * w - h)];
        const [ax, ay] = p(d), [bx, by] = p(Math.min(d + 11, 2 * (w + h) - 1));
        g.lineBetween(ax!, ay!, bx!, by!);
      }
      c.add([g,
        this.add.text(w / 2, h / 2 - 20, `P${slot + 1}`, text(64, "#3b4955", 2)).setOrigin(0.5),
        this.add.text(w / 2, h / 2 + 34, "OPEN SLOT", text(22, "#8a949f", 3)).setOrigin(0.5),
        this.add.text(w / 2, h / 2 + 62, "SHARE THE ROOM CODE", text(14, "#55636f", 2)).setOrigin(0.5)]);
      return;
    }
    const me = slot === this.mySlot;
    const id = (me ? this.character.id : player.character) as CharacterId;
    const character = PLAYABLE.find((p) => p.id === id) ?? PLAYABLE[0]!;
    const skinId = me ? this.skin : player.skin;
    const skins = characterSkins(character.id);
    const skin = skins.find((s) => s.id === skinId) ?? skins[0];
    const ready = slot === 0 || player.ready;

    g.fillStyle(0xf8fafb, 0.97).fillPoints(panel(0, 0, w, h, 18), true);
    g.fillStyle(0x101820, 1).fillRect(4, 4, w - 8, PORTRAIT_HEIGHT);
    c.add(g);
    const portrait = this.add.image(0, 0, this.portraitKey(character.id));
    this.cover(portrait, 4, 4, w - 8, PORTRAIT_HEIGHT);
    c.add(portrait);
    const top = this.add.graphics();
    top.fillStyle(character.accent, 0.94).fillRect(4, 4, w - 8, 36);
    top.lineStyle(me ? 3 : 1, me ? YELLOW : 0xaeb7c1, 1).strokePoints(panel(0, 0, w, h, 18), true, true);
    c.add([top,
      this.add.text(16, 10, `P${slot + 1}${slot === 0 ? " // HOST" : ""}${me ? " // YOU" : ""}`, text(18, "#f4f7f9", 1.5)),
      this.add.text(w - 16, 12, character.weapon.toUpperCase(), text(14, "#f4f7f9", 1)).setOrigin(1, 0),
      this.add.text(18, PORTRAIT_HEIGHT + 16, character.name.toUpperCase(), text(32, "#20262d", 1)),
      this.add.text(20, PORTRAIT_HEIGHT + 54, character.squad.toUpperCase(), text(14, "#65717c", 2)),
    ]);

    // Skins, as in Character Select: yours are a row of thumbnails (ones you don't own are dimmed;
    // the Shop sells them); other players' cards show the one they picked.
    const sy = PORTRAIT_HEIGHT + 78;
    c.add(this.add.text(18, sy, `SKIN // ${(skin?.name ?? "Default").toUpperCase()}`, text(14, "#65717c", 2)));
    const shown = me ? skins : skin ? [skin] : [];
    const locked = this.guest !== null && this.myReady;
    shown.forEach((option, i) => {
      const ix = 18 + i * 62, iy = sy + 22;
      const owned = ownsSkin(option), chosen = option.id === skin?.id;
      const frame = this.add.graphics();
      frame.fillStyle(0xe4e9ed, 1).fillRect(ix, iy, 54, 54);
      c.add(frame);
      if (this.textures.exists(`mp-skin-${option.id}`)) {
        const icon = this.add.image(0, 0, `mp-skin-${option.id}`);
        this.cover(icon, ix + 2, iy + 2, 50, 50);
        if (!owned) icon.setTint(0x6b737b).setAlpha(0.55);
        c.add(icon);
      }
      const outline = this.add.graphics();
      outline.lineStyle(chosen ? 3 : 1, chosen ? CYAN : 0xaeb7c1, 1).strokeRect(ix, iy, 54, 54);
      c.add(outline);
      if (me && owned && !chosen && !locked) {
        const zone = this.add.rectangle(ix, iy, 54, 54, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
        zone.on("pointerover", () => outline.clear().lineStyle(2, CYAN, 1).strokeRect(ix, iy, 54, 54));
        zone.on("pointerout", () => outline.clear().lineStyle(1, 0xaeb7c1, 1).strokeRect(ix, iy, 54, 54));
        zone.on("pointerup", () => { if (!this.leaving) this.pickSkin(option.id); });
        c.add(zone);
      }
    });

    // Ready bar
    const rg = this.add.graphics();
    rg.fillStyle(ready ? GREEN : 0x8a949f, 1).fillRect(14, h - 56, w - 42, 42);
    c.add([rg, this.add.text((w - 28) / 2 + 7, h - 35, slot === 0 ? "HOST // READY" : ready ? "READY" : "NOT READY", text(22, "#ffffff", 3)).setOrigin(0.5)]);
  }

  /** An angled menu button; `parent` keeps it inside a container (coordinates are then local). */
  private button(x: number, y: number, w: number, h: number, label: string, onClick: () => void,
    style: "cyan" | "dark", size: number, parent?: Phaser.GameObjects.Container): void {
    const c = this.add.container(parent ? x - parent.x : x, parent ? y - parent.y : y);
    const g = this.add.graphics();
    const draw = (hover: boolean): void => {
      g.clear();
      g.fillStyle(style === "cyan" ? (hover ? 0x2bb3e0 : 0x1f8fc4) : hover ? 0x1b2834 : 0x0d151d, 0.95).fillPoints(panel(0, 0, w, h, Math.min(14, h / 4)), true);
      g.lineStyle(1, style === "cyan" ? CYAN : hover ? CYAN : 0x55636f, 1).strokePoints(panel(0, 0, w, h, Math.min(14, h / 4)), true, true);
    };
    draw(false);
    c.add([g, this.add.text(w / 2, h / 2, label, text(size, "#f2f5f7", 2)).setOrigin(0.5)]);
    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => draw(true));
    hit.on("pointerout", () => draw(false));
    hit.on("pointerup", () => { if (!this.leaving) onClick(); });
    c.add(hit);
    (parent ?? this.layer!).add(c);
  }

  /** Make a container clickable, with a cyan glow on hover. */
  private hit(c: Phaser.GameObjects.Container, w: number, h: number, onClick: () => void, glow: Phaser.GameObjects.Graphics): void {
    const zone = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on("pointerover", () => { glow.setAlpha(0.88); c.x += 2; });
    zone.on("pointerout", () => { glow.setAlpha(1); c.x -= 2; });
    zone.on("pointerup", () => { if (!this.leaving) onClick(); });
    c.add(zone);
  }

  /** Fill a box with an image, cropped to cover it (top-aligned so faces stay in view). */
  private cover(image: Phaser.GameObjects.Image, x: number, y: number, w: number, h: number): void {
    const frame = image.frame;
    if (!frame || frame.width <= 1) { image.setVisible(false); return; }
    const scale = Math.max(w / frame.width, h / frame.height);
    const cw = w / scale, ch = h / scale, cx = (frame.width - cw) / 2;
    image.setOrigin(0).setScale(scale).setCrop(cx, 0, cw, ch);
    image.setPosition(x - cx * scale, y);
  }

  private fitBackground(): void {
    const image = this.background;
    if (!image || image.frame.width <= 1) return;
    image.setScale(Math.max(bleed.width / image.frame.width, HEIGHT / image.frame.height));
  }

  private portraitKey(id: string): string { return `mp-portrait-${id}`; }
  private zoneKey(id: string): string { return `mp-zone-${id}`; }
}

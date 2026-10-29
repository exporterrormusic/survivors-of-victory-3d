// Phase 2a (?coop=host): this game is the host. Guests who join with the room code get a real hero
// on this map (a Teammate driven by RemoteInput); the host sends them the world 20 times a second.
// Guests currently watch through the 2D viewer on coop-test.html; a 3D guest client is Phase 2b.

import type { LobbyHost, LobbyPick } from '../../net/lobby';
import { CoopHost } from '../../net/session';
import { generateRoomCode } from '../../net/room-code';
import { joinTrysteroRoom } from '../../net/trystero-transport';
import type { EntityState, PlayerState, RosterEntry } from '../../net/protocol';
import type { Player } from '../player';
import type { Target, TargetField } from '../targets';
import type { CoopSquad } from './coop-squad';
import { attackEcho } from '../mode/behaviors/echo';
import type { TelegraphLayer } from '../mode/telegraph';
import { heldBits, type RemoteInput } from './remote-input';
import type { InputSource } from '../input';
import type { HeroId, Teammate } from './teammate';

const SNAPSHOT_HZ = 20;
const HEROES: readonly HeroId[] = ['snow-white', 'scarlet', 'rapunzel', 'nayuta', 'dorothy'];
const round2 = (v: number) => Math.round(v * 100) / 100;

export interface RoundInfo {
  elapsed: number; phase: string; level: number; kills: number;
  /** the Survival objective box (mode/survival-mode.ts objectiveText) and the Obelisk's health, if any */
  objective?: { mode: string; status: string; detail: string };
  boss?: [number, number] | null;
}
/** round updates per second (the clock, objective and boss bar on guests) */
const ROUND_HZ = 4;

export class CoopNetHost {
  readonly code: string;
  private readonly host: CoopHost;
  private readonly remotes = new Map<number, { mate: Teammate; input: RemoteInput }>();
  /** guests whose hero is still loading, so a quick leave can cancel it */
  private readonly joining = new Set<number>();
  /** stable network ids; crowd targets are pooled, so the generation tells a reused one apart */
  private readonly ids = new WeakMap<Target, { generation: number; id: number }>();
  private nextId = 1;
  /** each guest's NIKKE and skin from the lobby (by slot) */
  private readonly picks: ReadonlyMap<number, LobbyPick>;
  private time = 0;
  private snapshotIn = 0;
  private roundIn = 0;

  constructor(private readonly squad: CoopSquad, private readonly local: Player, private readonly localInput: InputSource,
    localName: string, private readonly localHero: HeroId, private readonly field: TargetField, private readonly round: () => RoundInfo,
    private readonly tells: () => TelegraphLayer | null, private readonly localSkin = '', lobby: { code: string; lobby: LobbyHost } | null = null) {
    // From the Multiplayer lobby: its room, already holding the guests; from a ?coop=host link: a new room.
    this.code = lobby?.code ?? generateRoomCode();
    this.host = lobby?.lobby.session ?? new CoopHost(joinTrysteroRoom(this.code), { name: localName, character: localHero });
    this.picks = lobby?.lobby.picks ?? new Map();
    this.host.onPlayerJoined = entry => void this.join(entry);
    this.host.onPlayerLeft = entry => this.leave(entry.slot);
    // Bolts and missiles go out as they launch; guests fly harmless copies.
    attackEcho.listener = echo => { if (this.host.roster.length > 1) this.host.emit({ name: 'attack', data: echo }); };
    this.host.onGuestEvent = (slot, event) => {
      if (event.name === 'ping') this.host.emit({ name: 'pong', data: { slot, sent: event.data } });
      else if (event.name === 'talents' && Array.isArray(event.data)) this.remotes.get(slot)?.mate.applyPicks(event.data as (number | null)[]);
    };
    for (const entry of this.host.roster) if (entry.slot !== this.host.slot) void this.join(entry);
  }

  get players(): number { return this.host.roster.length; }

  async returnToLobby(): Promise<void> { await this.host.returnToLobby(); }

  /** Before the squad updates: hand each guest's latest controls to their hero. */
  update(dt: number): void {
    this.time += dt;
    this.host.dropSilent();
    for (const [slot, remote] of this.remotes) remote.input.apply(this.host.takeInput(slot));
    if ((this.snapshotIn -= dt) <= 0) { this.snapshotIn += 1 / SNAPSHOT_HZ; this.broadcast(); }
    if ((this.roundIn -= dt) <= 0) { this.roundIn = 1 / ROUND_HZ; this.host.emit({ name: 'round', data: this.round() }); }
  }

  /** A status line for every guest (Survival's banners). */
  banner(text: string, seconds = 3): void { if (this.host.roster.length > 1) this.host.emit({ name: 'banner', data: { text, seconds } }); }

  async close(): Promise<void> {
    attackEcho.listener = null;
    for (const slot of [...this.remotes.keys()]) this.leave(slot);
    await this.host.close();
  }

  private async join(entry: RosterEntry): Promise<void> {
    const pick = this.picks.get(entry.slot), character = pick?.character ?? entry.character;
    const hero = HEROES.includes(character as HeroId) ? character as HeroId : 'snow-white';
    this.joining.add(entry.slot);
    const remote = await this.squad.addRemote(entry.slot, hero, pick?.skin);
    if (!this.joining.delete(entry.slot)) { this.squad.remove(remote.mate); return; }
    this.remotes.set(entry.slot, remote);
    this.banner(`${entry.name} joined as ${remote.mate.name}`);
  }

  private leave(slot: number): void {
    this.joining.delete(slot);
    const remote = this.remotes.get(slot);
    if (!remote) return;
    this.remotes.delete(slot);
    this.squad.remove(remote.mate);
  }

  private broadcast(): void {
    const hero = (slot: number, p: Player, name: string, id: HeroId, input: InputSource | undefined, skin: string): PlayerState => ({
      slot, id: -1 - slot, name, hero: id, ...(skin ? { skin } : {}), x: round2(p.position.x), z: round2(p.position.z), yaw: round2(p.aimYaw),
      hp: Math.round(p.hp), maxHp: Math.round(p.maxHp), down: p.hp <= 0, buttons: input && p.hp > 0 ? heldBits(input) : 0,
    });
    const players = [hero(0, this.local, 'Host', this.localHero, this.localInput, this.localSkin),
      ...this.squad.teammates.map(t => hero(t.slot, t.player, t.name, t.hero, this.squad.controllerOf(t), t.skin))];
    const entities: EntityState[] = [];
    for (const t of this.field.targets) {
      if (!t.alive || t.scale < .5) continue;
      entities.push({ id: this.idOf(t), kind: t.type.id, x: round2(t.position.x), z: round2(t.position.z), yaw: round2(t.yaw),
        hp: Math.round(t.hp), maxHp: t.maxHp });
    }
    this.host.broadcast(this.time, players, entities, this.tells()?.snapshot());
  }

  private idOf(target: Target): number {
    const known = this.ids.get(target);
    if (known && known.generation === target.generation) return known.id;
    const id = this.nextId++;
    this.ids.set(target, { generation: target.generation, id });
    return id;
  }
}

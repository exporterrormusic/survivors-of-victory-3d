// Co-op test page (coop-test.html, dev only): real WebRTC through Trystero.
// Host here: a toy world of squares (the Phase 0 spike). Join a real game (?coop=host in the
// survivor, Phase 2a): a top-down view of that match — your hero, squad and Raptures — with real
// controls. ?host / ?join=CODE start automatically, ?hero=scarlet|rapunzel picks your hero, ?auto
// moves and fires on its own; window.coopTest exposes status for scripted checks.
import { CoopGuest, CoopHost } from './session';
import { interpolate } from './interpolation';
import { generateRoomCode, normalizeRoomCode } from './room-code';
import { joinTrysteroRoom } from './trystero-transport';
import { Button, type EntityState, type PlayerInput, type PlayerState } from './protocol';

const SPEED = 6, ARENA = { w: 30, h: 20 }, SIM_HZ = 30, SNAP_HZ = 20;
/** metres across the guest's view */
const VIEW_WIDTH = 60;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('view'), draw = canvas.getContext('2d')!;
const params = new URLSearchParams(location.search);
const auto = params.has('auto');

const keys = new Set<string>();
let mouseButtons = 0;
const pointer = { x: canvas.width / 2, y: canvas.height / 2 };
addEventListener('keydown', e => keys.add(e.code));
addEventListener('keyup', e => keys.delete(e.code));
canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  pointer.x = (e.clientX - r.left) * canvas.width / r.width;
  pointer.y = (e.clientY - r.top) * canvas.height / r.height;
});
canvas.addEventListener('pointerdown', e => { mouseButtons |= 1 << e.button; canvas.focus(); });
addEventListener('pointerup', e => { mouseButtons &= ~(1 << e.button); });
canvas.addEventListener('contextmenu', e => e.preventDefault());

const status = { role: 'idle' as 'idle' | 'host' | 'guest', code: '', state: 'idle', slot: -1, players: 0, enemies: 0,
  joinMs: 0, rttMs: 0, snapsPerSecond: 0, lastSnapTick: 0, round: null as unknown, log: [] as string[] };
(window as unknown as { coopTest: typeof status }).coopTest = status;

const log = (line: string) => {
  status.log.push(`${(performance.now() / 1000).toFixed(1)}s ${line}`);
  $('log').textContent = status.log.slice(-40).join('\n');
};

/** World → canvas, centred on `focus`. */
let focus = { x: 0, z: 0 };
const scale = () => canvas.width / VIEW_WIDTH;
const toCanvas = (x: number, z: number) => ({ x: canvas.width / 2 + (x - focus.x) * scale(), y: canvas.height / 2 - (z - focus.z) * scale() });
const toWorld = (cx: number, cy: number) => ({ x: focus.x + (cx - canvas.width / 2) / scale(), z: focus.z - (cy - canvas.height / 2) / scale() });

/** The survivor's axes: +Z is up the screen (W), +X right (D). */
function controls(self: { x: number; z: number }): Omit<PlayerInput, 'seq'> {
  let x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  let buttons = (mouseButtons & 1 ? Button.fire : 0) | (mouseButtons & 4 ? Button.special : 0)
    | (keys.has('KeyE') ? Button.burst : 0) | (keys.has('KeyR') ? Button.reload : 0)
    | (keys.has('ShiftLeft') || keys.has('Space') ? Button.dash : 0);
  let aim = toWorld(pointer.x, pointer.y);
  if (auto && !x && !z) {
    const t = performance.now() / 1000;
    x = Math.cos(t * .5); z = Math.sin(t * .5);
    aim = { x: self.x + Math.cos(t) * 8, z: self.z + Math.sin(t) * 8 };
    buttons |= Math.floor(t * 4) % 2 ? Button.fire : 0;
  }
  const length = Math.hypot(x, z) || 1;
  return { moveX: x / length, moveZ: z / length, aimX: aim.x, aimZ: aim.z, buttons };
}

const COLORS = ['#e0457b', '#2f7de1', '#2aa36b', '#e09a1f', '#8a55d6'];
function render(players: PlayerState[], entities: EntityState[], self: number): void {
  draw.clearRect(0, 0, canvas.width, canvas.height);
  // ground grid every 5 m so movement reads
  draw.strokeStyle = '#e3e7ef'; draw.lineWidth = 1;
  const step = 5 * scale(), ox = (canvas.width / 2 - focus.x * scale()) % step, oy = (canvas.height / 2 + focus.z * scale()) % step;
  for (let x = ox; x < canvas.width; x += step) { draw.beginPath(); draw.moveTo(x, 0); draw.lineTo(x, canvas.height); draw.stroke(); }
  for (let y = oy; y < canvas.height; y += step) { draw.beginPath(); draw.moveTo(0, y); draw.lineTo(canvas.width, y); draw.stroke(); }
  for (const e of entities) {
    const at = toCanvas(e.x, e.z);
    draw.fillStyle = '#d23a3a';
    draw.beginPath(); draw.arc(at.x, at.y, 6, 0, Math.PI * 2); draw.fill();
    if (e.maxHp && e.hp < e.maxHp) bar(at.x, at.y - 11, 16, e.hp / e.maxHp, '#d23a3a');
  }
  for (const p of players) {
    const at = toCanvas(p.x, p.z);
    draw.globalAlpha = p.down ? .4 : 1;
    draw.fillStyle = COLORS[p.slot % COLORS.length];
    draw.fillRect(at.x - 10, at.y - 10, 20, 20);
    draw.strokeStyle = '#1c2230'; draw.lineWidth = 2;
    draw.beginPath(); draw.moveTo(at.x, at.y); draw.lineTo(at.x + Math.sin(p.yaw) * 18, at.y - Math.cos(p.yaw) * 18); draw.stroke();
    if (p.slot === self) draw.strokeRect(at.x - 13, at.y - 13, 26, 26);
    draw.globalAlpha = 1;
    if (p.maxHp) bar(at.x, at.y - 18, 28, p.hp / p.maxHp, '#2aa36b');
    if (p.name) { draw.fillStyle = '#1c2230'; draw.font = '11px system-ui'; draw.textAlign = 'center'; draw.fillText(p.name, at.x, at.y - 23); }
  }
}
function bar(x: number, y: number, width: number, share: number, color: string): void {
  draw.fillStyle = '#1c223033'; draw.fillRect(x - width / 2, y, width, 3);
  draw.fillStyle = color; draw.fillRect(x - width / 2, y, width * Math.max(0, share), 3);
}

const spawn = (slot: number): PlayerState => ({ slot, id: slot, x: -6 + slot * 6, z: 0, yaw: 0, hp: 1, maxHp: 1, down: false, name: slot ? `Guest ${slot}` : 'Host' });

function startHost(): void {
  const code = generateRoomCode(), started = performance.now();
  Object.assign(status, { role: 'host', code, state: 'hosting', slot: 0 });
  $('code').textContent = code;
  log(`hosting ${code}`);
  const host = new CoopHost(joinTrysteroRoom(code), { name: 'Host', character: 'test' });
  const players = new Map<number, PlayerState>([[0, spawn(0)]]);
  host.onPlayerJoined = e => { players.set(e.slot, spawn(e.slot)); log(`slot ${e.slot} joined after ${((performance.now() - started) / 1000).toFixed(1)}s`); };
  host.onPlayerLeft = e => { players.delete(e.slot); log(`slot ${e.slot} left`); };
  host.onGuestEvent = (slot, e) => { if (e.name === 'ping') host.emit({ name: 'pong', data: { slot, sent: e.data } }); };
  let time = 0, snapAccumulator = 0;
  setInterval(() => {
    const dt = 1 / SIM_HZ; time += dt;
    for (const [slot, p] of players) {
      const input = slot === 0 ? controls(p) : host.takeInput(slot);
      if (!input) continue;
      p.x = Math.max(-ARENA.w / 2, Math.min(ARENA.w / 2, p.x + input.moveX * SPEED * dt));
      p.z = Math.max(-ARENA.h / 2, Math.min(ARENA.h / 2, p.z + input.moveZ * SPEED * dt));
      p.yaw = Math.atan2(input.aimX - p.x, input.aimZ - p.z);
    }
    snapAccumulator += dt;
    if (snapAccumulator >= 1 / SNAP_HZ) { snapAccumulator -= 1 / SNAP_HZ; host.broadcast(time, [...players.values()].map(p => ({ ...p })), []); }
    status.players = players.size;
    focus = { x: 0, z: 0 };
    render([...players.values()], [], 0);
    $('stats').textContent = `HOST ${code}\nplayers ${players.size}`;
  }, 1000 / SIM_HZ);
}

function startGuest(raw: string): void {
  const code = normalizeRoomCode(raw);
  if (!code) { log(`"${raw}" is not a room code`); return; }
  const hero = params.get('hero') ?? 'snow-white';
  const started = performance.now();
  Object.assign(status, { role: 'guest', code, state: 'joining' });
  $('code').textContent = code;
  log(`joining ${code} as ${hero}`);
  const guest = new CoopGuest(joinTrysteroRoom(code), { name: 'Guest', character: hero }, { timeoutMs: 30000 });
  guest.onJoined = slot => { Object.assign(status, { state: 'joined', slot, joinMs: Math.round(performance.now() - started) }); log(`joined as slot ${slot} in ${status.joinMs} ms`); };
  guest.onRejected = reason => { status.state = `rejected: ${reason}`; log(status.state); };
  guest.onLost = reason => { status.state = `lost: ${reason}`; log(reason === 'no-host' ? 'could not connect (no host answered in 30 s)' : 'host left'); };
  guest.onEvent = e => {
    const pong = e.data as { slot: number; sent: number } | undefined;
    if (e.name === 'pong' && pong?.slot === guest.slot) status.rttMs = Math.round(performance.now() - pong.sent);
    else if (e.name === 'round') status.round = e.data;
    else if (e.name === 'banner') log(String((e.data as { text: string }).text));
  };
  setInterval(() => guest.send({ name: 'ping', data: performance.now() }), 1000);
  let lastTick = 0;
  setInterval(() => {
    const tick = guest.snapshots.latest?.tick ?? 0;
    status.snapsPerSecond = tick - lastTick; lastTick = tick; status.lastSnapTick = tick;
  }, 1000);
  let self = { x: 0, z: 0 };
  setInterval(() => guest.sendInput(controls(self)), 1000 / SIM_HZ);
  // No local prediction yet: your hero moves when the host says so (about one round trip plus
  // ~100 ms of smoothing). The 3D guest client (Phase 2b) predicts with the real hero's speed.
  const frame = () => {
    requestAnimationFrame(frame);
    const sample = guest.snapshots.sample(performance.now() / 1000);
    if (!sample) return;
    const { players, entities } = interpolate(sample);
    const own = players.find(p => p.slot === guest.slot);
    if (own) { self = own; focus = own; }
    Object.assign(status, { players: players.length, enemies: entities.length });
    render(players, entities, guest.slot);
    const round = status.round as { elapsed: number; phase: string; level: number; kills: number } | null;
    $('stats').textContent = `GUEST ${code} · ${status.state} · slot ${guest.slot}${own ? ` · HP ${own.hp}/${own.maxHp}${own.down ? ' DOWN' : ''}` : ''}\n`
      + `join ${status.joinMs} ms · round trip ${status.rttMs} ms · ${status.snapsPerSecond} snapshots/s · ${entities.length} Raptures`
      + (round ? `\nround ${round.phase} ${Math.floor(round.elapsed)} s · squad level ${round.level} · ${round.kills} kills` : '');
  };
  frame();
}

$('host').addEventListener('click', () => { if (status.role === 'idle') startHost(); });
$('join').addEventListener('click', () => { if (status.role === 'idle') startGuest($<HTMLInputElement>('join-code').value); });
if (params.has('host')) startHost();
else if (params.get('join')) startGuest(params.get('join')!);

import { ABILITY_RANK_COSTS, type AbilityStage, type AbilityTrack } from './ability-ranks';
import { abilityIcon, rankFrame } from './talent-icons';
import { mountPanelTrim } from './hud-frames';
import type { Run } from './run';
import './talent-menu.css';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
interface NodeView { button: HTMLButtonElement; status: HTMLElement; check: HTMLElement; row: number; column: number }

/** All three ability plans stay visible. Combat is paused by the owning run. */
export class TalentMenu {
  private readonly dialog = el('dialog', 'st-menu');
  private readonly points = el('b', 'st-points');
  private readonly level = el('span', 'st-level');
  private readonly board = el('div', 'st-board');
  private readonly detailLabel = el('span', 'st-eyebrow');
  private readonly detailName = el('h3', 'st-detail-name');
  private readonly detailText = el('p', 'st-detail-text');
  private readonly requirement = el('p', 'st-requirement');
  private readonly preview = el('img', 'st-preview-art');
  private readonly purchase = el('button', 'st-purchase');
  private readonly purchaseHint = el('span', 'st-purchase-hint');
  private readonly announcement = el('span', 'st-announcement');
  private readonly nodes: NodeView[] = [];
  private readonly rankLabels: HTMLElement[] = [];
  private selectedRow = 0;
  /** Zero-based rank column; column 5 is the exclusive lobby-selected capstone. */
  private selectedColumn = 1;
  private readonly tracks: readonly AbilityTrack[];

  constructor(private readonly run: Run, portrait: string, private readonly onClose: () => void, private readonly onPurchase: () => void) {
    this.tracks = run.talents.tracks;
    this.dialog.id = 'run-talents';
    this.dialog.setAttribute('aria-labelledby', 'st-title');
    const header = el('header', 'st-header');
    const face = el('div', 'st-face');
    const image = el('img', 'st-portrait');
    image.src = asset(portrait);
    image.alt = 'Snow White';
    face.append(image);
    // Same single, slight top-left cut as the actual bottom-left HUD portrait.
    mountPanelTrim(face, 'portrait');
    const identity = el('div', 'st-identity');
    const title = el('h2', '', 'Ability ranks');
    title.id = 'st-title';
    const wallet = el('div', 'st-wallet');
    wallet.append(el('span', 'st-name', 'Snow White'), this.level, this.points);
    identity.append(title, wallet);
    const close = el('button', 'st-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Resume test range');
    close.addEventListener('click', onClose);
    header.append(face, identity, el('span', 'st-paused', 'Paused'), close);

    const headings = el('div', 'st-columns');
    headings.setAttribute('aria-hidden', 'true');
    headings.append(el('span', 'st-columns-label', 'Ability'));
    for (let rank = 1; rank <= 6; rank++) {
      const heading = el('div', rank === 6 ? 'st-capstone-heading' : '');
      heading.append(el('b', '', rank === 6 ? 'Capstone' : `Rank ${rank}`),
        el('small', '', rank === 6 ? 'Choose one' : rank === 1 ? 'Base' : `${ABILITY_RANK_COSTS[rank - 1]} SP`));
      headings.append(heading);
    }
    this.board.setAttribute('role', 'group');
    this.board.setAttribute('aria-label', 'Ability roadmap. Arrow keys select; Enter upgrades.');
    for (const [row, track] of this.tracks.entries()) {
      const line = el('section', 'st-row');
      line.dataset.track = track.id;
      line.setAttribute('aria-label', track.name);
      const art = el('div', 'st-row-art');
      art.dataset.track = track.id;
      const illustration = el('img', '');
      illustration.src = asset(track.art);
      illustration.alt = '';
      const label = el('div', 'st-row-label');
      const rankLabel = el('span', '');
      this.rankLabels.push(rankLabel);
      label.append(el('h3', '', track.name), rankLabel);
      art.append(illustration, label);
      const rail = el('div', 'st-track');
      for (const [column, stage] of [...track.ranks, track.capstone].entries()) {
        const button = el('button', 'st-node');
        button.type = 'button';
        button.dataset.track = track.id;
        button.dataset.rank = column === 5 ? 'capstone' : String(column + 1);
        button.dataset.talent = stage.effects[0];
        button.classList.toggle('st-capstone', column === 5);
        const tile = el('span', 'st-tile');
        tile.innerHTML = rankFrame + abilityIcon(stage.icon);
        const check = el('span', 'st-check', '✓');
        check.setAttribute('aria-hidden', 'true');
        tile.append(check);
        const status = el('span', 'st-node-status');
        button.append(tile, el('span', 'st-node-name', stage.name), status);
        button.addEventListener('click', () => this.select(row, column));
        rail.append(button);
        this.nodes.push({ button, status, check, row, column });
      }
      line.append(art, rail);
      this.board.append(line);
    }

    const detail = el('section', 'st-detail');
    detail.setAttribute('aria-label', 'Selected upgrade');
    const preview = el('div', 'st-preview');
    this.preview.alt = '';
    preview.append(this.preview);
    const copy = el('div', 'st-detail-copy');
    this.detailName.id = 'st-detail-name';
    copy.append(this.detailLabel, this.detailName, this.detailText, this.requirement);
    const action = el('div', 'st-action');
    this.purchase.type = 'button';
    this.purchase.addEventListener('click', () => this.buy());
    action.append(this.purchase, this.purchaseHint);
    detail.append(preview, copy, action);
    const footer = el('footer', 'st-footer');
    footer.append(el('span', '', 'One capstone / Swap in lobby / Ranks reset each run'));
    const controls = el('span', 'st-key-help', 'Arrows: select · Enter: upgrade');
    const resume = el('button', 'st-resume');
    resume.type = 'button';
    resume.append(el('kbd', '', 'Tab'), document.createTextNode(' Resume'));
    resume.addEventListener('click', onClose);
    footer.append(controls, resume);
    this.announcement.setAttribute('role', 'status');
    this.announcement.setAttribute('aria-live', 'polite');
    this.dialog.append(header, headings, this.board, detail, footer, this.announcement);
    document.getElementById('frame')!.append(this.dialog);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); onClose(); });
    this.dialog.addEventListener('keydown', event => this.keydown(event));
  }

  get isOpen(): boolean { return this.dialog.open; }
  open(): void {
    if (this.isOpen) return;
    this.refresh();
    this.dialog.showModal();
    this.focusSelected();
  }
  close(): void { if (this.isOpen) this.dialog.close(); }

  private select(row: number, column: number): void {
    this.selectedRow = row;
    this.selectedColumn = column;
    this.refresh();
  }

  private refresh(): void {
    const { talents, skillPoints } = this.run;
    this.level.textContent = `LV ${this.run.level}`;
    this.points.textContent = `${skillPoints} SP`;
    for (const [index, track] of this.tracks.entries()) this.rankLabels[index].textContent = `${talents.abilityRank(track.id)} / 5`;
    for (const view of this.nodes) {
      const track = this.tracks[view.row], current = talents.abilityRank(track.id);
      const capstone = view.column === 5, rank = view.column + 1;
      const stage = capstone ? track.capstone : track.ranks[view.column];
      const owned = capstone ? talents.activeCapstone === track.id : rank <= current;
      const available = !capstone && talents.unavailable(track.id, rank, skillPoints) === null;
      const selected = view.row === this.selectedRow && view.column === this.selectedColumn;
      view.button.dataset.state = owned ? 'owned' : available ? 'available' : 'locked';
      view.button.setAttribute('aria-pressed', String(selected));
      view.button.tabIndex = selected ? 0 : -1;
      view.check.hidden = !owned;
      view.status.textContent = capstone ? owned ? 'Active' : talents.selectedCapstone === track.id ? 'Equipped / needs Rank 5' : 'Choose in lobby' : owned ? 'Unlocked' : `${ABILITY_RANK_COSTS[view.column]} SP`;
      view.button.setAttribute('aria-label', `${track.name}, ${capstone ? 'capstone' : `rank ${rank}`}, ${stage.name}. ${owned ? 'Unlocked' : capstone ? view.status.textContent : available ? 'Available, ' + view.status.textContent : talents.unavailable(track.id, rank, skillPoints)}`);
    }
    this.refreshDetail();
  }

  private get selection(): { track: AbilityTrack; stage: AbilityStage; capstone: boolean } {
    const track = this.tracks[this.selectedRow], capstone = this.selectedColumn === 5;
    return { track, stage: capstone ? track.capstone : track.ranks[this.selectedColumn], capstone };
  }

  private refreshDetail(): void {
    const { track, stage, capstone } = this.selection;
    const current = this.run.talents.abilityRank(track.id), rank = this.selectedColumn + 1;
    const owned = capstone ? this.run.talents.activeCapstone === track.id : rank <= current;
    const reason = owned ? 'Unlocked' : this.run.talents.unavailable(track.id, rank, this.run.skillPoints);
    this.detailLabel.textContent = `${track.name} · ${capstone ? 'Capstone' : `Rank ${this.selectedColumn + 1}`}`;
    this.detailName.textContent = stage.name;
    this.detailText.textContent = stage.description;
    this.preview.src = asset(stage.art);
    this.preview.alt = `${stage.name} upgrade illustration`;
    this.preview.parentElement!.dataset.track = track.id;
    if (capstone) {
      const equipped = this.run.talents.selectedCapstone === track.id;
      this.requirement.textContent = owned ? 'Active capstone. Only one can be active at a time.'
        : equipped ? `Equipped for this run. Requires ${track.name} Rank 5.`
        : 'Not equipped. Choose one capstone in the lobby before deploying.';
      this.purchase.disabled = true;
      this.purchase.textContent = owned ? 'Active' : equipped ? 'Equipped' : 'Choose in lobby';
      this.purchaseHint.textContent = 'Return to the lobby to reset skills and swap your capstone.';
      return;
    }
    this.requirement.textContent = owned ? 'Unlocked' : rank === 5
      ? this.run.talents.selectedCapstone === track.id ? `Activates your equipped capstone: ${track.capstone.name}.` : 'Rank 5 unlocks this ability upgrade only. Its capstone is not equipped.'
      : 'Earlier rank effects remain active.';
    this.purchase.disabled = reason !== null;
    this.purchase.textContent = owned ? 'Unlocked' : `Upgrade ${track.name} / ${ABILITY_RANK_COSTS[rank - 1]} SP`;
    this.purchaseHint.textContent = owned ? '' : reason ?? `Rank ${current} to ${rank}: ${track.ranks[rank - 1].name}`;
  }

  private buy(): void {
    const { track, capstone } = this.selection;
    if (capstone) return;
    const rank = this.selectedColumn + 1;
    if (!this.run.talents.purchase(track.id, rank, this.run)) return;
    const bonus = this.run.talents.activeCapstone === track.id && rank === 5 ? ` ${track.capstone.name} is now active.` : '';
    this.announcement.textContent = `${track.name} Rank ${rank} unlocked.${bonus} ${this.run.skillPoints} SP remaining.`;
    this.onPurchase(); this.refresh(); this.focusSelected();
  }

  private focusSelected(): void {
    this.nodes.find(n => n.row === this.selectedRow && n.column === this.selectedColumn)?.button.focus({ preventScroll: true });
  }

  private keydown(event: KeyboardEvent): void {
    if (event.code === 'Tab' || event.code === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) this.onClose();
      return;
    }
    if (!(event.target instanceof HTMLElement) || !event.target.closest('.st-node')) return;
    if (event.code === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) this.buy();
      return;
    }
    if (!event.code.startsWith('Arrow')) return;
    event.preventDefault(); event.stopPropagation();
    const row = Math.max(0, Math.min(this.tracks.length - 1, this.selectedRow + (event.code === 'ArrowDown' ? 1 : event.code === 'ArrowUp' ? -1 : 0)));
    const column = Math.max(0, Math.min(5, this.selectedColumn + (event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0)));
    this.select(row, column);
    this.focusSelected();
  }
}

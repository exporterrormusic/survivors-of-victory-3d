// Talent tiers on screen (docs/SNOW_WHITE_TALENT_TIERS.md).
//   TalentPicker: Heroes of the Storm-style prompt above the bottom-left portrait. It never
//     pauses: each choice shows its full explanation; click it or press 1/2/3 to learn it.
//     Quest progress for chosen quest talents sits in the same place.
//   TalentBoard: the Tab view of every tier, chosen talents lit. The run pauses behind it,
//     and a waiting tier can be picked here too.

import type { Run } from './run';
import type { TalentTiers, TierTalent } from './talent-tiers';
import { abilityIcon, rankFrame } from './talent-icons';
import { ICONS } from './hud';
import { mountHudFrame, mountPanelTrim } from './hud-frames';
import type { TalentAbility } from './talent-tiers';
import { KIT_INFO, type KitSlot } from './kit-info';
import './talent-tiers.css';

const BURST_ICON = '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M32 2l5 21 17-12-12 17 21 4-21 5 12 17-17-12-5 21-5-21-17 12 12-17-21-5 21-4-12-17 17 12z"/></svg>';
const PASSIVE_ICON = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4"><circle cx="32" cy="32" r="24"/><path d="M32 18v14l9 6" stroke-linecap="round"/></svg>';
const UTILITY_ICON = '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M24 6h16v18h18v16H40v18H24V40H6V24h18z"/></svg>';
/** One plain white silhouette per ability: the kit's own HUD card icons for weapon and special. */
const abilityIcons = (kit: { weapon: string; special: string }): Record<TalentAbility, string> =>
  ({ weapon: ICONS[kit.weapon] ?? '', special: ICONS[kit.special] ?? '', burst: BURST_ICON, utility: UTILITY_ICON });
const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', parent?: HTMLElement, text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  parent?.append(node);
  return node;
};

/** A square talent tile: its illustration when there is one, otherwise the icon. */
function tile(talent: TierTalent, parent: HTMLElement): HTMLElement {
  const box = el('span', 'tt-tile', parent);
  box.dataset.ability = talent.ability;
  box.innerHTML = rankFrame + (talent.art ? '' : abilityIcon(talent.icon));
  if (talent.art) {
    const art = el('img', 'tt-art', box);
    art.src = asset(talent.art); art.alt = ''; art.draggable = false;
  }
  return box;
}

function describe(talent: TierTalent): string {
  const quest = talent.quest ? ` Quest: ${talent.quest.label} ${talent.quest.goal} → ${talent.quest.rewardName}: ${talent.quest.rewardText}` : '';
  return `${talent.description}${quest}`;
}

export class TalentPicker {
  private readonly root = el('section');
  private readonly heading = el('header', 'tp-heading');
  private readonly options = el('div', 'tp-options');
  private readonly quests = el('div', 'tp-quests');
  private readonly toast = el('p', 'tp-toast');
  /** ring and LEVEL N title, replayed on each level-up that unlocks a talent choice */
  private readonly burst = el('div', 'level-up-burst');
  private seenLevel: number;
  private shownTier = -2;
  private shownLevel = -1;
  private toastFor = 0;
  private questText = '';
  private paused = false;

  private readonly icons: Record<TalentAbility, string>;

  constructor(private readonly run: Run & { tiers: TalentTiers }, parent: HTMLElement, kitIcons: { weapon: string; special: string },
    private readonly onPick: (talent: TierTalent) => void) {
    this.icons = abilityIcons(kitIcons);
    this.root.id = 'run-talent-pick';
    this.root.setAttribute('aria-label', 'Talent choice');
    this.options.setAttribute('role', 'group');
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');
    this.root.append(this.toast, this.quests, this.heading, this.options);
    this.burst.setAttribute('aria-hidden', 'true');
    this.seenLevel = run.level;
    parent.append(this.root, this.burst);
    // Keep held movement and fire through a pick, and keep focus off the buttons: survivor input
    // ignores keys aimed at a focused button, which used to freeze WASD until it was re-pressed.
    this.root.addEventListener('pointerdown', (event) => { event.stopPropagation(); if (event.pointerType === 'mouse') event.preventDefault(); });
    window.addEventListener('keydown', this.keydown);
    run.onQuestComplete = (talent) => this.announce(`Quest complete · ${talent.quest!.rewardName}`);
  }

  /** Learn option `index` (0-based) of the waiting tier. */
  pick(index: number): boolean {
    const tier = this.run.tiers.pending(this.run.level);
    if (tier < 0) return false;
    const talent = this.run.tiers.choose(tier, index, this.run.level);
    if (!talent) return false;
    this.announce(`Talent learned · ${talent.name}`);
    this.onPick(talent);
    this.refresh(true);
    return true;
  }

  setPaused(paused: boolean): void { this.paused = paused; this.root.hidden = paused; }

  update(dt: number): void {
    if (this.toastFor > 0 && (this.toastFor -= dt) <= 0) this.toast.textContent = '';
    this.refresh(false);
  }

  dispose(): void { window.removeEventListener('keydown', this.keydown); this.root.remove(); this.burst.remove(); }

  private celebrate(level: number, talentReady: boolean): void {
    this.burst.replaceChildren();
    el('i', 'lu-ring', this.burst);
    el('b', 'lu-title', this.burst, `Level ${level}`);
    if (talentReady) el('small', 'lu-sub', this.burst, 'Talent ready · 1 / 2 / 3');
    this.burst.classList.remove('lu-play');
    void this.burst.offsetWidth; // restart the animation
    this.burst.classList.add('lu-play');
  }

  private announce(text: string): void {
    this.toast.textContent = text;
    this.toastFor = 2.6;
    this.root.classList.remove('tp-flash');
    void this.root.offsetWidth; // restart the flash
    this.root.classList.add('tp-flash');
  }

  private readonly keydown = (event: KeyboardEvent): void => {
    if (this.paused || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, dialog')) return;
    const index = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(event.code) % 3;
    if (index < 0 || this.run.tiers.pending(this.run.level) < 0) return;
    if (this.pick(index)) event.preventDefault();
  };

  private refresh(force: boolean): void {
    const { tiers, level } = this.run;
    const tier = tiers.pending(level);
    // Only a level that brings a talent choice gets the big notice; others just tick the bar.
    if (level > this.seenLevel && tiers.tiers.some((t) => t.level > this.seenLevel && t.level <= level)) this.celebrate(level, true);
    this.seenLevel = level;
    if (force || tier !== this.shownTier || level !== this.shownLevel) {
      this.shownTier = tier; this.shownLevel = level;
      this.root.dataset.state = tier < 0 ? 'idle' : 'ready';
      this.options.replaceChildren();
      this.heading.replaceChildren();
      if (tier >= 0) {
        const waiting = tiers.pendingCount(level);
        el('b', '', this.heading, `Lv ${tiers.tiers[tier].level} talent`);
        el('small', '', this.heading, waiting > 1 ? `${tiers.tiers[tier].label} · ${waiting - 1} more waiting` : tiers.tiers[tier].label);
        // HotS talent list: a round icon, then the name and the full explanation, one row per choice.
        tiers.tiers[tier].options.forEach((talent, index) => {
          const button = el('button', 'tp-option', this.options);
          button.type = 'button';
          button.dataset.talent = talent.id;
          button.dataset.ability = talent.ability;
          button.setAttribute('aria-label', `${index + 1}: ${talent.name}, ${tiers.abilities[talent.ability]}. ${describe(talent)}`);
          // Same outline as the Dash/Weapon/Special cards: both cuts and the corner marks.
          mountHudFrame(button);
          // Icon and name on one line; the explanation gets the row's full width below it.
          const title = el('span', 'tp-title', button);
          el('span', 'tp-icon', title).innerHTML = this.icons[talent.ability];
          el('b', '', title, talent.name);
          el('small', '', title, tiers.abilities[talent.ability]);
          el('span', 'tp-text', button, talent.description);
          if (talent.quest) el('span', 'tp-quest-text', button, `Quest: ${talent.quest.goal} ${talent.quest.label.toLowerCase()} → ${talent.quest.rewardName}. ${talent.quest.rewardText}`);
          button.addEventListener('click', (event) => { event.stopPropagation(); this.pick(index); if (event.detail > 0) button.blur(); });
        });
      }
    }
    const quests = tiers.quests.map((q) => q.done ? `${q.talent.name} · ${q.quest.rewardName} ✓` : `${q.quest.label} ${q.count} / ${q.quest.goal}`).join('\n');
    if (quests !== this.questText) {
      this.questText = quests;
      this.quests.replaceChildren(...tiers.quests.map((q) => {
        const row = el('div', 'tp-quest');
        row.dataset.done = String(q.done);
        el('b', '', row, q.done ? q.quest.rewardName : q.quest.label);
        el('span', '', row, q.done ? 'Complete' : `${q.count} / ${q.quest.goal}`);
        const bar = el('i', '', row);
        bar.style.setProperty('--progress', String(q.count / q.quest.goal));
        return row;
      }));
    }
  }

}

/** Tab: every tier at once. Same open/close/isOpen shape as the rank TalentMenu.
 * `preview` is the lobby/shop read-only view: every tier shown at full strength, nothing pickable. */
export class TalentBoard {
  private readonly dialog = el('dialog', 'tt-board');
  private readonly level = el('span', 'tt-level');
  private readonly rows = el('div', 'tt-rows');

  constructor(private readonly run: Run & { tiers: TalentTiers }, portrait: string, private readonly onClose: () => void,
    private readonly onPick: (talent: TierTalent) => void, private readonly preview = false) {
    this.dialog.id = 'run-talents';
    this.dialog.setAttribute('aria-labelledby', 'tt-title');
    const header = el('header', 'tt-header', this.dialog);
    const face = el('div', 'tt-face', header);
    const image = el('img', '', face);
    image.src = asset(portrait); image.alt = run.characterName;
    mountPanelTrim(face, 'portrait');
    const identity = el('div', 'tt-identity', header);
    const title = el('h2', '', identity, 'Talents');
    title.id = 'tt-title';
    const line = el('div', 'tt-wallet', identity);
    el('span', '', line, run.characterName);
    line.append(this.level);
    el('span', 'tt-paused', header, preview ? 'Talent preview' : 'Paused');
    const close = el('button', 'tt-close', header, '×');
    close.type = 'button';
    close.setAttribute('aria-label', preview ? 'Close preview' : 'Resume game');
    close.addEventListener('click', onClose);
    this.dialog.append(this.kitStrip(), this.rows);
    const footer = el('footer', 'tt-footer', this.dialog);
    el('span', '', footer, preview ? 'Level up in a run to choose one talent per tier' : 'One talent per tier · picks last for this run');
    const resume = el('button', 'tt-resume', footer);
    resume.type = 'button';
    resume.append(el('kbd', '', undefined, preview ? 'Esc' : 'Tab'), document.createTextNode(preview ? ' Back' : ' Resume'));
    resume.addEventListener('click', onClose);
    document.getElementById('frame')!.append(this.dialog);
    this.dialog.addEventListener('cancel', (event) => { event.preventDefault(); onClose(); });
    this.dialog.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.code !== 'Tab' && event.code !== 'Escape') return;
      event.preventDefault();
      if (!event.repeat) onClose();
    });
  }

  /** The base kit before any talents: weapon, special, burst and passive, one short card each. */
  private kitStrip(): HTMLElement {
    const strip = el('section', 'tt-kit');
    strip.setAttribute('aria-label', 'Base kit');
    const info = KIT_INFO[this.run.characterId];
    const icons: Record<KitSlot, string> = { weapon: ICONS[info.icons.weapon] ?? '', special: ICONS[info.icons.special] ?? '', burst: BURST_ICON, passive: PASSIVE_ICON };
    const slotLabel: Record<KitSlot, string> = { weapon: 'Weapon', special: 'Special', burst: 'Burst', passive: 'Passive' };
    for (const entry of info.entries) {
      const card = el('div', 'tt-kit-card', strip);
      card.dataset.slot = entry.slot;
      const icon = el('span', 'tt-kit-icon', card);
      icon.innerHTML = icons[entry.slot];
      const copy = el('span', 'tt-copy', card);
      el('small', '', copy, slotLabel[entry.slot]);
      el('b', '', copy, entry.name);
      el('span', 'tt-kit-text', copy, entry.text);
      card.title = `${entry.name}: ${entry.text}`;
    }
    return strip;
  }

  get isOpen(): boolean { return this.dialog.open; }
  get element(): HTMLDialogElement { return this.dialog; }
  open(): void {
    if (this.isOpen) return;
    this.refresh();
    this.dialog.showModal();
    this.dialog.querySelector<HTMLButtonElement>('.tt-talent[data-state="available"]')?.focus({ preventScroll: true });
  }
  close(): void { if (this.isOpen) this.dialog.close(); }
  destroy(): void { this.close(); this.dialog.remove(); }

  private refresh(): void {
    const { tiers, level } = this.run;
    const pending = tiers.pending(level);
    this.level.textContent = this.preview ? `${tiers.tiers.length} tiers` : `Lv ${level}`;
    this.rows.replaceChildren(...tiers.tiers.map((tier, index) => {
      const row = el('section', 'tt-row');
      const chosen = tiers.chosenIndex(index);
      row.dataset.state = this.preview ? 'preview' : chosen !== null ? 'chosen' : index === pending ? 'pending' : tier.level <= level ? 'waiting' : 'locked';
      const label = el('div', 'tt-row-label', row);
      el('b', '', label, `Lv ${tier.level}`);
      el('small', '', label, tier.label);
      const quests = new Map(tiers.quests.map((q) => [q.talent.id, q]));
      // A two-choice tier (the level 10 form) centres its pair between ornamental flourishes.
      const pair = tier.options.length === 2;
      row.dataset.count = String(tier.options.length);
      const flourish = (side: 'left' | 'right') => {
        const node = el('span', `tt-flourish tt-flourish-${side}`, row);
        node.setAttribute('aria-hidden', 'true');
        el('i', 'tt-flourish-line', node); el('i', 'tt-flourish-gem', node); el('i', 'tt-flourish-line tt-flourish-short', node);
      };
      if (pair) flourish('left');
      for (const [option, talent] of tier.options.entries()) {
        if (pair && option === 1) {
          // An "or" divider sets the two forms apart.
          const divider = el('span', 'tt-divider', row);
          divider.setAttribute('aria-hidden', 'true');
          el('i', 'tt-divider-line', divider); el('i', 'tt-flourish-gem', divider); el('i', 'tt-divider-line', divider);
        }
        const button = el('button', 'tt-talent', row);
        button.type = 'button';
        const state = this.preview ? 'preview' : chosen === option ? 'chosen' : chosen !== null ? 'passed' : index === pending ? 'available' : 'locked';
        button.dataset.state = state;
        tile(talent, button);
        const copy = el('span', 'tt-copy', button);
        el('small', '', copy, tiers.abilities[talent.ability]);
        el('b', '', copy, talent.name);
        el('span', 'tt-text', copy, talent.description);
        const quest = quests.get(talent.id);
        if (talent.quest) {
          // Goal/progress on one line, the reward on its own line beneath.
          const q = talent.quest, block = el('span', 'tt-quest', copy);
          el('span', 'tt-quest-goal', block, quest?.done ? 'Quest complete'
            : quest ? `Quest · ${quest.count} / ${q.goal} ${q.label.toLowerCase()}` : `Quest · ${q.goal} ${q.label.toLowerCase()}`);
          const reward = el('span', 'tt-quest-reward', block);
          el('b', '', reward, `${q.rewardName}:`);
          reward.append(document.createTextNode(` ${q.rewardText}`));
        }
        button.title = `${talent.name}: ${describe(talent)}`;
        button.disabled = state !== 'available';
        button.setAttribute('aria-label', `Level ${tier.level}, ${talent.name}, ${state}. ${describe(talent)}`);
        button.addEventListener('click', () => {
          const picked = tiers.choose(index, option, this.run.level);
          if (!picked) return;
          this.onPick(picked);
          this.refresh();
          this.dialog.querySelector<HTMLButtonElement>('.tt-talent[data-state="available"]')?.focus({ preventScroll: true });
        });
      }
      if (pair) flourish('right');
      return row;
    }));
  }
}

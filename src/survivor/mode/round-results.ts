export type RoundOutcome = 'victory' | 'defeat' | 'endless';
export interface RoundResultView {
  outcome: RoundOutcome;
  /** WAVE or ENDLESS */
  mode: string;
  /** operation zone name */
  zone?: string;
  coop?: boolean;
  time: string;
  kills: number;
  level: number;
  talents: string[];
  /** a personal best set this round, e.g. 'New best time' */
  record?: string | null;
  /** the NIKKE who fought, with her Burst art */
  nikke?: { name: string; art: string | null };
  note?: string;
}
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

const TITLES: Record<RoundOutcome, [string, string]> = {
  victory: ['Mission complete', 'Obelisk destroyed'],
  defeat: ['Mission failed', 'Squad down'],
  endless: ['Run ended', 'Squad down'],
};

/**
 * The after-action report for solo players, hosts and guests, in the HUD's language (survival-mode.css):
 * the outcome, this round's three numbers, the core if one was earned, and the talents taken.
 * `[data-reward]` is filled by the caller (empty hides it); `[data-actions]` holds the buttons.
 */
export function roundResultMarkup(view: RoundResultView): string {
  const [title, reason] = TITLES[view.outcome];
  const where = [view.zone, view.mode, view.coop ? 'Co-op' : ''].filter((part): part is string => !!part).map(escape).join(' <i>//</i> ');
  const art = view.nikke?.art
    ? `<figure class="result-art"><img src="${escape(view.nikke.art)}" alt=""><figcaption>${escape(view.nikke.name)}</figcaption></figure>` : '';
  const stat = (label: string, value: string) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return `<section class="result-card result-${view.outcome}${art ? ' has-art' : ''}">${art}
    <div class="result-body">
      <header><span class="result-eyebrow">Ark system <i>//</i> After action report</span>
        <h1>${title}</h1><p class="result-where">${escape(reason)} <i>//</i> ${where}</p></header>
      <dl class="result-stats">${stat('Time', escape(view.time))}${stat('Raptures defeated', view.kills.toLocaleString())}${stat(view.coop ? 'Squad level' : 'Level', String(view.level))}</dl>
      ${view.record ? `<p class="result-record">${escape(view.record)}</p>` : ''}
      <div class="core-reward" data-reward></div>
      ${view.talents.length ? `<div class="result-talents"><span>Talents</span><ul>${view.talents.map(t => `<li>${escape(t)}</li>`).join('')}</ul></div>` : ''}
      ${view.note ? `<p class="result-note">${escape(view.note)}</p>` : ''}
      <footer data-actions><button data-retry>Deploy again</button><button data-ark>Return to Ark</button></footer>
    </div></section>`;
}

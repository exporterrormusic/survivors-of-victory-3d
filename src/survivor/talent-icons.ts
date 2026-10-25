/** Small ivory silhouettes, matching the live HUD's simple equipment icons. */
const paths: Record<string, string> = {
  rifle: '<path d="m7 36 10-5h8v-5h24v6h10v5H41l-4 15h-8l4-15h-9l-9 5H7zm18-15h20v3H25z"/>',
  rounds: '<path d="m12 12 5-8 5 8v40H12zm15 0 5-8 5 8v40H27zm15 0 5-8 5 8v40H42z"/>',
  flame: '<path d="M34 4c3 16-11 19-5 29 6-3 10-8 10-16 14 13 20 27 8 38-9 9-26 7-33-3C2 33 24 26 20 13c7 5 7 10 7 10S35 14 34 4z"/>',
  shield: '<path d="M32 5 53 13v18c0 13-10 22-21 29C21 53 11 44 11 31V13zm0 7-14 6v13c0 10 6 17 14 23 8-6 14-13 14-23V18z"/><path d="m32 19 9 3v10c0 6-4 11-9 16-5-5-9-10-9-16V22z"/>',
  turret: '<path d="m5 14 19-6 5 13v30L9 47zm30 7 5-13 19 6-4 33-20 4zM30 5h4v51h-4z"/><g fill="#10171b"><circle cx="13" cy="24" r="3"/><circle cx="21" cy="22" r="3"/><circle cx="18" cy="31" r="3"/><circle cx="43" cy="22" r="3"/><circle cx="51" cy="24" r="3"/><circle cx="46" cy="31" r="3"/></g><path d="M23 55h18v5H23z"/>',
  'anti-ship': '<path d="M4 28h47v13H25l-4 10h-7l3-10H4zm47 3h11v7H51zM19 18h25v7H19z"/><path d="m53 13 3 9 7-4-5 10h-6l-7-8 7 2z"/>',
  battery: '<path d="M24 5h16v6H24zM17 12h30v47H17zm5 5v37h20V17z"/><path d="M28 22h8v10h5L28 49l2-13h-7z"/>',
  blast: '<path d="m31 4 7 20 16-13-7 22 14 6-18 5 7 16-18-12-15 12 4-18L3 39l18-9L14 12l14 12z"/>',
  burst: '<path d="m30 4 5 28 7-14 2 20 15-12-13 19 12 9-22-5-7 11-4-13L7 52l12-14L5 22l20 10z"/>',
  crown: '<path d="m7 19 13 11L32 9l12 21 13-11-6 30H13zm8 35h34v5H15z"/>',
  chevrons: '<path d="m8 12 17 20L8 52h12l17-20-17-20zm23 0 17 20-17 20h12l17-20-17-20z"/>',
  focus: '<circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="3"/><path d="M30 3h4v16h-4zm0 42h4v16h-4zM3 30h16v4H3zm42 0h16v4H45z"/><circle cx="32" cy="32" r="4"/>',
  stun: '<path d="m34 4-19 31h15l-5 25 25-36H35z"/><path d="m8 12 8 7-3 4-8-7zm43-1 8 3-5 10-4-2z"/>',
  goddess: '<path d="m32 4 8 18 20 2-15 14 5 22-18-11-18 11 5-22L4 24l20-2zm0 10-6 13-13 1 11 10-3 13 11-7 11 7-3-13 11-10-13-1z"/><path d="m32 24 7 9-7 12-7-12z"/>',
};
paths['burn-slow'] = '<g transform="translate(-3 2) scale(.76)">'+paths.flame+'</g><path d="M49 30v28m-12-21 24 14m-24 0 24-14" fill="none" stroke="currentColor" stroke-width="3"/>';
paths.charged = '<g transform="translate(-4 8) scale(.8)">'+paths.rounds+'</g><path d="m48 7 3 13 10-6-8 12 9 5-13 1-6 12 1-16-9-4 12-4z"/>';
paths.arsenal = '<g transform="translate(-3 14) scale(.65)">'+paths.turret+'</g><path d="m40 13 5-8 5 8v35H40zm13 0 4-8 4 8v35h-8z"/>';
paths['battery-ring'] = '<g transform="translate(13 13) scale(.6)">'+paths.blast+'</g><path d="M5 5h12v12H5zm42 0h12v12H47zM5 47h12v12H5zm42 0h12v12H47z"/>';

export const abilityIcon = (name: string): string => '<svg class="st-icon" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">'+(paths[name] ?? paths.focus)+'</svg>';

/** Detached brackets complete the uncut square; they never join the diagonal. */
export const rankFrame = '<svg class="st-tile-frame" viewBox="0 0 80 80" aria-hidden="true"><path class="st-tile-surface" d="M14 2H78V66L66 78H2V14Z"/><path class="st-tile-brackets" d="M10 2H2V10M70 78H78V70"/></svg>';

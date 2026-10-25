// Systems that exist in code but are switched off for the first version. They may come back:
// flip a flag to restore one instead of rebuilding it.
export const FEATURES = {
  /**
   * NIPMH modules (src/frontend/features/nipmh): the Shop's NIPMHS tab, module cases on the
   * surface and module loot. Not in the first version; the Shop sells character unlocks only.
   */
  nipmh: false,
} as const;

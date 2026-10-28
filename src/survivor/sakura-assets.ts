export const SAKURA_ASSETS = ['sakura-roofed-gate', 'sakura-torii', 'sakura-lantern', 'sakura-shrine', 'sakura-wall', 'sakura-bench'] as const;
export type SakuraAsset = typeof SAKURA_ASSETS[number];
export function isSakuraAsset(asset:string):asset is SakuraAsset { return (SAKURA_ASSETS as readonly string[]).includes(asset); }

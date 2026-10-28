export const FROZEN_ASSETS=['frozen-mountain','frozen-hangar','frozen-relay','frozen-outcrop','frozen-barrier','frozen-beacon'] as const;
export type FrozenAsset=typeof FROZEN_ASSETS[number];
export function isFrozenAsset(value:string):value is FrozenAsset{return (FROZEN_ASSETS as readonly string[]).includes(value);}

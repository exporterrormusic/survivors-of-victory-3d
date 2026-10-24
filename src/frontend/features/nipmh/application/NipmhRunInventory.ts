import { getNipmh, isNipmhId, type NipmhId } from "../domain/NipmhCatalog";

export const DEFAULT_NIPMH_CAPACITY = 3;

export interface NipmhRunSnapshot {
  readonly capacity: number;
  readonly equippedIds: readonly NipmhId[];
  readonly ownedIds: readonly NipmhId[];
}

export class NipmhRunInventory {
  private capacityValue = DEFAULT_NIPMH_CAPACITY;
  private readonly eligibleIdsValue: ReadonlySet<NipmhId>;
  private equippedIdsValue: NipmhId[] = [];
  private readonly ownedIdsValue = new Set<NipmhId>();

  public constructor(eligibleIds: Iterable<NipmhId>) {
    this.eligibleIdsValue = new Set(eligibleIds);
  }

  public get capacity(): number {
    return this.capacityValue;
  }

  public get eligibleIds(): ReadonlySet<NipmhId> {
    return this.eligibleIdsValue;
  }

  public get equippedIds(): readonly NipmhId[] {
    return this.equippedIdsValue;
  }

  public get ownedIds(): ReadonlySet<NipmhId> {
    return this.ownedIdsValue;
  }

  public get usedCapacity(): number {
    return this.equippedIdsValue.reduce(
      (total, id) => total + getNipmh(id).cost,
      0,
    );
  }

  public get availableIds(): readonly NipmhId[] {
    return [...this.eligibleIdsValue].filter(
      (id) => !this.ownedIdsValue.has(id),
    );
  }

  public grant(id: NipmhId): boolean {
    if (!this.eligibleIdsValue.has(id) || this.ownedIdsValue.has(id))
      return false;
    this.ownedIdsValue.add(id);
    return true;
  }

  public equip(id: NipmhId): boolean {
    const family = getNipmh(id).family;
    if (
      !this.ownedIdsValue.has(id) ||
      this.equippedIdsValue.includes(id) ||
      (family !== undefined &&
        this.equippedIdsValue.some(
          (equippedId) => getNipmh(equippedId).family === family,
        )) ||
      this.usedCapacity + getNipmh(id).cost > this.capacityValue
    )
      return false;
    this.equippedIdsValue = [...this.equippedIdsValue, id];
    return true;
  }

  public unequip(id: NipmhId): boolean {
    if (!this.equippedIdsValue.includes(id)) return false;
    this.equippedIdsValue = this.equippedIdsValue.filter(
      (equippedId) => equippedId !== id,
    );
    return true;
  }

  public clearStartingSelection(): void {
    this.equippedIdsValue = [];
    this.ownedIdsValue.clear();
  }

  public upgradeCapacity(amount = 1): number {
    if (!Number.isSafeInteger(amount) || amount < 1)
      throw new RangeError(
        "NIPMH capacity upgrades must be a positive integer.",
      );
    this.capacityValue += amount;
    return this.capacityValue;
  }

  public snapshot(): NipmhRunSnapshot {
    return {
      capacity: this.capacityValue,
      equippedIds: [...this.equippedIdsValue],
      ownedIds: [...this.ownedIdsValue],
    };
  }

  public restore(snapshot: unknown): void {
    const normalized = validateNipmhRunSnapshot(
      snapshot,
      this.eligibleIdsValue,
    );
    this.capacityValue = normalized.capacity;
    this.equippedIdsValue = [...normalized.equippedIds];
    this.ownedIdsValue.clear();
    normalized.ownedIds.forEach((id) => this.ownedIdsValue.add(id));
  }
}

export function validateNipmhRunSnapshot(
  snapshot: unknown,
  eligibleIds: ReadonlySet<NipmhId>,
): NipmhRunSnapshot {
  if (snapshot === null || typeof snapshot !== "object")
    throw new TypeError("Stored NIPMH inventory is invalid.");

  const candidate = snapshot as Partial<
    Record<keyof NipmhRunSnapshot, unknown>
  >;
  if (
    !Number.isSafeInteger(candidate.capacity) ||
    Number(candidate.capacity) < DEFAULT_NIPMH_CAPACITY ||
    !isUniqueNipmhArray(candidate.ownedIds) ||
    !isUniqueNipmhArray(candidate.equippedIds)
  )
    throw new TypeError("Stored NIPMH inventory is invalid.");

  const ownedIds = candidate.ownedIds;
  const equippedIds = candidate.equippedIds;
  if (
    ownedIds.some((id) => !eligibleIds.has(id)) ||
    equippedIds.some((id) => !ownedIds.includes(id)) ||
    hasDuplicateFamilies(equippedIds) ||
    equippedIds.reduce((total, id) => total + getNipmh(id).cost, 0) >
      Number(candidate.capacity)
  )
    throw new TypeError("Stored NIPMH inventory is invalid.");

  return {
    capacity: Number(candidate.capacity),
    equippedIds: [...equippedIds],
    ownedIds: [...ownedIds],
  };
}

function hasDuplicateFamilies(ids: readonly NipmhId[]): boolean {
  const families = ids
    .map((id) => getNipmh(id).family)
    .filter((family) => family !== undefined);
  return new Set(families).size !== families.length;
}

function isUniqueNipmhArray(value: unknown): value is NipmhId[] {
  return (
    Array.isArray(value) &&
    value.every(isNipmhId) &&
    new Set(value).size === value.length
  );
}

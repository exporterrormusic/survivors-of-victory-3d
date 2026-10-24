// Broad phase for targets, crowd neighbors and projectiles. Buckets are reused.
export interface SpatialBody { readonly position: { x: number; z: number }; readonly alive: boolean }
export class SpatialGrid<T extends SpatialBody> {
  private readonly buckets = new Map<number, T[]>();
  private readonly cellSize: number;
  constructor(cellSize = 6) { this.cellSize = cellSize; }
  rebuild(items: readonly T[]): void {
    for (const bucket of this.buckets.values()) bucket.length = 0;
    for (const item of items) {
      if (!item.alive) continue;
      const key = this.key(Math.floor(item.position.x / this.cellSize), Math.floor(item.position.z / this.cellSize));
      let bucket = this.buckets.get(key);
      if (!bucket) { bucket = []; this.buckets.set(key, bucket); }
      bucket.push(item);
    }
  }
  query(x: number, z: number, radius: number, out: T[]): T[] {
    out.length = 0;
    for (let cz = Math.floor((z - radius) / this.cellSize); cz <= Math.floor((z + radius) / this.cellSize); cz++) {
      for (let cx = Math.floor((x - radius) / this.cellSize); cx <= Math.floor((x + radius) / this.cellSize); cx++) {
        const bucket = this.buckets.get(this.key(cx, cz));
        if (bucket) for (const item of bucket) if (item.alive) out.push(item);
      }
    }
    return out;
  }
  private key(x: number, z: number): number { return (x + 32768) * 65536 + z + 32768; }
}

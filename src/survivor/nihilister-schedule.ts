/** One Nihilister appearance every two minutes of active eruption time. */
export class NihilisterSchedule {
  private remaining = 120;
  reset(): void { this.remaining = 120; }
  update(dt: number, spawn: () => boolean): void {
    if (dt <= 0) return;
    this.remaining -= dt;
    if (this.remaining > 1e-8) return;
    if (spawn()) this.reset();
    else this.remaining = 1; // Retry when a safe landing area is available.
  }
}

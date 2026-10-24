export interface LevelUpResult {
  readonly levelsGained: number;
}

export interface DamageLogEntry {
  readonly amount: number;
  readonly source: string;
  readonly time: number;
}

export interface RunProgressionSnapshot {
  readonly experience: number;
  readonly level: number;
  readonly skillPoints: number;
}

export class RunState {
  public burst = 0;
  public elapsedSeconds = 0;
  public experience = 0;
  public bossKills = 0;
  public damageDealt = 0;
  public readonly damageLog: DamageLogEntry[] = [];
  public kills = 0;
  public level = 1;
  public score = 0;
  public skillPoints: number;
  private integrityFailure?: string;

  public constructor(
    private readonly goddessFall: boolean,
    private readonly experienceMultiplier: number,
    private readonly endless: boolean,
  ) {
    this.skillPoints = goddessFall ? 3 : 0;
  }

  public addBurst(amount: number): void {
    this.burst = Math.min(100, this.burst + amount);
  }

  public restoreProgression(snapshot: RunProgressionSnapshot): void {
    if (
      !Number.isFinite(snapshot.experience) ||
      snapshot.experience < 0 ||
      !Number.isSafeInteger(snapshot.level) ||
      snapshot.level < 1 ||
      !Number.isSafeInteger(snapshot.skillPoints) ||
      snapshot.skillPoints < 0
    )
      throw new TypeError("Stored run progression is invalid.");
    this.experience = snapshot.experience;
    this.level = snapshot.level;
    this.skillPoints = snapshot.skillPoints;
  }

  public snapshotProgression(): RunProgressionSnapshot {
    return {
      experience: this.experience,
      level: this.level,
      skillPoints: this.skillPoints,
    };
  }

  public spendBurst(fraction = 1): boolean {
    if (this.burst < 100) return false;
    this.burst = Math.max(
      0,
      this.burst - 100 * Math.max(0, Math.min(1, fraction)),
    );
    return true;
  }

  public addExperience(rawAmount: number): LevelUpResult {
    this.experience += rawAmount * this.experienceMultiplier;
    let levelsGained = 0;
    while (this.experience >= this.requiredExperience) {
      this.experience -= this.requiredExperience;
      this.level += 1;
      this.skillPoints += 1;
      levelsGained += 1;
    }
    return { levelsGained };
  }

  public get requiredExperience(): number {
    const curveScale = this.goddessFall ? 2 : 5;
    if (this.level === 1) return 79 * curveScale;
    const next = Math.round((4 * (this.level + 1)) ** 2.1);
    const current = Math.round((4 * this.level) ** 2.1);
    return (next - current) * curveScale;
  }

  public get wave(): number {
    const wave = Math.floor(this.elapsedSeconds / 30) + 1;
    return this.endless ? wave : Math.min(20, wave);
  }

  public spendSkillPoints(amount: number): boolean {
    if (amount <= 0 || this.skillPoints < amount) return false;
    this.skillPoints -= amount;
    return true;
  }

  public taint(reason: string): void {
    this.integrityFailure ??= reason;
  }

  public get tainted(): boolean {
    return this.integrityFailure !== undefined;
  }

  public get taintReason(): string | undefined {
    return this.integrityFailure;
  }

  public recordDamageTaken(amount: number, source: string): void {
    this.damageLog.unshift({ amount, source, time: this.elapsedSeconds });
    if (this.damageLog.length > 20) this.damageLog.length = 20;
  }

  public recordEnemyDamage(amount: number): void {
    this.damageDealt += amount;
  }

  public recordKill(score: number, boss: boolean): void {
    this.kills += 1;
    this.score += score;
    if (boss) this.bossKills += 1;
  }
}

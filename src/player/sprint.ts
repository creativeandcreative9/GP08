/** A continuous, actually moving run reaches 2× at 10 s and caps at 3× at 20 s. */
export class SprintPace {
  private seconds = 0;

  get multiplier(): number { return 1 + this.seconds / 10; }

  advance(elapsed: number, movingRun: boolean): void {
    if (!movingRun) { this.reset(); return; }
    if (Number.isFinite(elapsed) && elapsed > 0) this.seconds = Math.min(20, this.seconds + elapsed);
  }

  reset(): void { this.seconds = 0; }
}

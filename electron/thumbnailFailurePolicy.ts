export const cachedThumbnailFailureCode = "ETHUMBNAILFAILED";

export type ThumbnailFailureLogDecision = "detail" | "storm" | "suppress";

export class ThumbnailFailureLogPolicy {
  private windowStartedAt = 0;
  private observedCount = 0;

  constructor(
    readonly windowMs = 5_000,
    readonly detailLimit = 8
  ) {}

  record(now = Date.now()): ThumbnailFailureLogDecision {
    if (this.windowStartedAt === 0 || now - this.windowStartedAt >= this.windowMs) {
      this.windowStartedAt = now;
      this.observedCount = 0;
    }
    this.observedCount += 1;
    if (this.observedCount <= this.detailLimit) return "detail";
    if (this.observedCount === this.detailLimit + 1) return "storm";
    return "suppress";
  }
}

// Tracks preview request/session ownership; cleanup stays with each preview service.
export class PreviewIdleGuard {
  private readonly sessions = new Set<string>();
  private active = 0;
  get idle() { return this.active === 0 && this.sessions.size === 0; }
  async run<T>(method: string, args: unknown[], work: () => Promise<T>): Promise<T> {
    const group = method.split(".")[0], key = group + "/" + String(args[0]);
    if (method.endsWith(".open") || method === "text.read") this.sessions.add(key);
    this.active++;
    try {
      const result = await work();
      if (method.endsWith(".close") || method === "text.cancel") this.sessions.delete(key);
      return result;
    } finally { this.active--; }
  }
}

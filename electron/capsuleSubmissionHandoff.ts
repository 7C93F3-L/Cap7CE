interface CapsuleSubmissionHandoffOptions {
  activateNormal: () => boolean | Promise<boolean>;
  canActivate: () => boolean;
  dispatchQuery: (query: string) => void;
}

export class CapsuleSubmissionHandoff {
  private requestId = 0;

  constructor(private readonly options: CapsuleSubmissionHandoffOptions) {}

  submit(query: string) {
    this.cancel();
    const requestId = this.requestId;
    setImmediate(() => void this.beginHandoff(requestId, query));
  }

  cancel() {
    this.requestId += 1;
  }

  private async beginHandoff(requestId: number, query: string) {
    if (requestId !== this.requestId || !this.options.canActivate()) return;
    if (!await this.options.activateNormal()) return;
    if (requestId === this.requestId) this.options.dispatchQuery(query);
  }
}

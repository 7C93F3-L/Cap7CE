import type { CoreMetadataChangeSpecification, CoreMetadataPolicy, CoreMetadataProtocol } from "../core/coreMetadataProtocol";
import { metadataBuildDelay } from "./metadataBuildProgress";

type Protocol = Pick<CoreMetadataProtocol, "consumeChanges" | "status">;

// A wake produces bounded pages before extraction gets a turn. Remaining hints
// request another wake-drain pass; an empty batch never starts an idle poll.
export async function discoverMetadataChanges(protocol: Protocol, policy: CoreMetadataPolicy,
  specifications: readonly CoreMetadataChangeSpecification[], signal: AbortSignal, yieldMs: number) {
  let hasMore = true;
  for (let step = 0; step < 64 && hasMore; step++) {
    signal.throwIfAborted();
    hasMore = (await protocol.consumeChanges(specifications, signal)).hasMore;
    if (hasMore) await metadataBuildDelay(yieldMs, signal);
  }
  // Deduplicated queue counts supply the denominator, not overlapping file and
  // parent hints or historical completed rows. Offline work remains durable.
  const remaining = new Map<number, number>();
  for (const volumeId of policy.volumeOrder) {
    if (!policy.includes.some(scope => scope.volumeId === volumeId) ||
      policy.excludes.some(scope => scope.volumeId === volumeId && scope.rootFileReference === null)) continue;
    for (const specification of specifications) {
      const status = await protocol.status(specification.kind, specification.extractorVersion, volumeId, signal);
      if (status.state !== "active" || !status.ledger) throw new Error("metadata-session-inactive");
      if (status.ledger.unavailableVolumeIds?.includes(volumeId)) break;
      remaining.set(specification.kind, (remaining.get(specification.kind) ?? 0) + status.ledger.pendingJobs + status.ledger.leasedJobs);
    }
  }
  return { hasMore, remaining, discovered: [...remaining.values()].reduce((sum, count) => sum + count, 0) };
}

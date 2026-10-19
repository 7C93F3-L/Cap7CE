namespace Cap7CE.Core.Host.MetadataScheduling;

public sealed record MetadataBuildProgress(string Phase = "idle", string? VolumeId = null, long Discovered = 0,
    long Processed = 0, long Failed = 0, long Unsupported = 0, long? Total = null, double? ProgressFraction = null,
    double? RemainingSeconds = null, string? ErrorCode = null, MetadataBuild.MetadataDirectoryStorageError? StorageError = null);

// Immutable snapshots; notification failures cannot revoke the extraction owner or corrupt its state.
internal sealed class MetadataSweepProgress(Action<MetadataBuildProgress>? changed)
{
    private readonly object gate = new();
    private MetadataBuildProgress value = new();
    internal MetadataBuildProgress Snapshot { get { lock (gate) return value; } }
    internal void Reset(MetadataBuildProgress next) { lock (gate) value = next; }
    internal void Notify() { try { changed?.Invoke(Snapshot); } catch (Exception error) when (error is not OutOfMemoryException) { } }
    internal void Set(Func<MetadataBuildProgress, MetadataBuildProgress> update)
    {
        lock (gate) {
            value = update(value);
            value = value with { ProgressFraction = value.Phase == "completed" ? 1 : value.Total is null ? null : value.Total == 0 ? 0 : Math.Min(1, (double)value.Processed / value.Total.Value) };
        }
        Notify();
    }
    internal void Phase(string phase) => Set(value => value with { Phase = phase,
        RemainingSeconds = phase is "extracting" or "completed" ? value.RemainingSeconds : null });
}

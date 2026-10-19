using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host;

// Ephemeral observations only: no Catalog writes, timers or source reads.
public sealed class CatalogPreparationProgressOwner(TimeProvider? time = null)
{
    private readonly object gate = new();
    private readonly TimeProvider clock = time ?? TimeProvider.System;
    private CatalogPreparationProgress? current;
    private long started;
    public void Report(string volumeId, string drive, string stage, long processed = 0, long? total = null, double? fraction = null)
    {
        lock (gate) {
            if (current?.VolumeId != volumeId || current.Stage != stage) started = clock.GetTimestamp();
            fraction ??= total is > 0 ? (double)processed / total.Value : null;
            fraction = fraction is { } value && double.IsFinite(value) ? Math.Clamp(value, 0, 1) : null;
            var seconds = clock.GetElapsedTime(started).TotalSeconds;
            double? remaining = seconds >= 3 && fraction is > 0.02 and < 1
                ? seconds * (1 - fraction.Value) / fraction.Value : null;
            current = new(volumeId, drive, stage, processed, total, fraction, remaining);
        }
    }
    public CatalogPreparationProgress? Read() { lock (gate) return current; }
    public void Clear() { lock (gate) current = null; }
}

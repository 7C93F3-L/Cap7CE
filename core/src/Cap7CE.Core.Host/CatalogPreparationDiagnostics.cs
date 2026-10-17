using System.Diagnostics;
using System.Text.Json;
using Cap7CE.Core.Catalog;

namespace Cap7CE.Core.Host;

// Only fixed categories, drive letters and measurements cross stderr. Never
// serialize Reader identifiers, file names, paths or exception messages.
public sealed class CatalogPreparationDiagnostics(Action<string, object> sink)
{
    public static CatalogPreparationDiagnostics StandardError() => new((name, data) =>
        Console.Error.WriteLine(JsonSerializer.Serialize(new { type = "catalog-diagnostic-v1", name, data })));

    public void Write(string name, object data)
    {
        try { sink(name, data); }
        catch (Exception error) when (error is not OutOfMemoryException) { }
    }

    public Activity Begin(string displayName, string origin) => new(this, displayName, origin);

    public static string? RebuildReason(CatalogV2VolumeSnapshot volume, CatalogReaderInspection inspection)
    {
        if (volume.JournalId is null || !string.Equals(volume.JournalId, inspection.JournalId.ToString("X16"), StringComparison.OrdinalIgnoreCase)) return "journal-replaced";
        if (volume.CheckpointUsn is not { } checkpoint) return "checkpoint-missing";
        if (checkpoint < inspection.FirstUsn) return "checkpoint-expired";
        if (checkpoint < inspection.LowestValidUsn) return "checkpoint-invalidated";
        return checkpoint > inspection.NextUsn ? "checkpoint-ahead" : null;
    }

    public sealed class Activity
    {
        private readonly CatalogPreparationDiagnostics owner;
        private readonly string activityId = Guid.NewGuid().ToString("N");
        private readonly string? driveLetter;
        private readonly string origin;
        private readonly Stopwatch watch = Stopwatch.StartNew();
        private string stage = "inspect";
        public Activity(CatalogPreparationDiagnostics owner, string displayName, string origin)
        {
            this.owner = owner; this.origin = origin;
            driveLetter = displayName.Length >= 2 && char.IsAsciiLetter(displayName[0]) && displayName[1] == ':'
                ? char.ToUpperInvariant(displayName[0]).ToString() : null;
            Emit("started");
        }
        public void Stage(string next) { stage = next; Emit("stage"); }
        public void Rebuild(string reason) => Emit("rebuild", reason);
        public void Retry() => Emit("retry", "journal-discontinuity");
        public void Complete(CatalogSynchronizationMeasurement measurement) => Emit("completed", measurement: measurement);
        public void Cancel() => Emit("cancelled");
        public void Fail() => Emit("failed", "preparation-failed");
        private void Emit(string state, string? reason = null, CatalogSynchronizationMeasurement? measurement = null) =>
            owner.Write("preparation-" + state, new { activityId, driveLetter, origin, stage, reason,
                elapsedMilliseconds = Math.Round(watch.Elapsed.TotalMilliseconds, 3),
                kind = measurement?.Kind, records = measurement?.Records, pages = measurement?.Pages,
                readerReadMilliseconds = measurement?.ReaderReadMilliseconds,
                stagingWriteMilliseconds = measurement?.StagingWriteMilliseconds,
                directoryPathMilliseconds = measurement?.DirectoryPathMilliseconds,
                publishMilliseconds = measurement?.PublishMilliseconds, totalMilliseconds = measurement?.TotalMilliseconds });
    }
}

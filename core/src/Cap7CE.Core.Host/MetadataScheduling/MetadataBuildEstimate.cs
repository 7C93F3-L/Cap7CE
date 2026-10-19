using Cap7CE.Core.Catalog.FileFacts;

namespace Cap7CE.Core.Host.MetadataScheduling;

// Original bounded samples and unknown-ETA rule; no timers or background sampling.
public sealed class MetadataBuildEstimate
{
    private readonly Dictionary<FileFactKind, Queue<double>> samples = [];
    public void Add(FileFactKind kind, double milliseconds)
    {
        if (!samples.TryGetValue(kind, out var values)) samples[kind] = values = new();
        values.Enqueue(Math.Max(1, milliseconds)); if (values.Count > 64) values.Dequeue();
    }
    public double? Remaining(IReadOnlyDictionary<FileFactKind, long> counts)
    {
        if (samples.Values.Sum(values => values.Count) < 8) return null;
        double milliseconds = 0;
        foreach (var (kind, count) in counts) {
            if (count <= 0) continue;
            if (!samples.TryGetValue(kind, out var values) || values.Count < 2) return null;
            milliseconds += count * values.Average();
        }
        return Math.Ceiling(milliseconds / 1000);
    }
}

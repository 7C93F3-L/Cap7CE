using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using Cap7CE.Core.Catalog;

namespace Cap7CE.Core.Host;

public static class CatalogReadOnlyCli
{
    private const int MaximumInputCharacters = 16_384;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
    };

    public static async Task<CatalogReadOnlyReport> RunAsync(
        TextReader input,
        CancellationToken cancellationToken)
    {
        var inputLine = await input.ReadLineAsync(cancellationToken)
            ?? throw new ArgumentException("Catalog input is required.", nameof(input));
        if (inputLine.Length is 0 or > MaximumInputCharacters)
        {
            throw new ArgumentException("Catalog input length is invalid.", nameof(input));
        }
        var request = JsonSerializer.Deserialize<CatalogReadOnlyRequest>(inputLine, JsonOptions)
            ?? throw new JsonException("Catalog input is invalid.");
        request.Validate();

        var database = new CatalogDatabase(request.DatabasePath);
        var openTimer = Stopwatch.StartNew();
        await database.ValidateReadOnlyAsync(cancellationToken);
        var state = await database.ReadStateAsync(cancellationToken);
        var volume = await database.ReadVolumeAsync(request.VolumeId, cancellationToken)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        openTimer.Stop();
        if (!state.Queryable || volume.State is not (CatalogVolumeState.Ready or CatalogVolumeState.CatchingUp))
        {
            throw new CatalogNotQueryableException("Catalog volume is not queryable.");
        }

        var databaseBytes = await database.ReadStorageBytesAsync(cancellationToken);
        var rowCount = await database.CountNodesAsync(request.VolumeId, cancellationToken);
        var firstPage = await MeasureOnceAsync(
            () => database.ReadNodesPageAsync(request.VolumeId, null, CatalogDatabase.MaximumReadPage, cancellationToken));

        await database.SearchNodesByNameAsync(
            request.VolumeId, request.NameHitQuery, CatalogDatabase.MaximumReadPage, cancellationToken);
        await database.SearchNodesByNameAsync(
            request.VolumeId, request.NameMissQuery, CatalogDatabase.MaximumReadPage, cancellationToken);
        await database.SearchNodesByExtensionAsync(
            request.VolumeId, request.Extension, CatalogDatabase.MaximumReadPage, cancellationToken);

        var nameHit = await MeasureRepeatedAsync(
            () => database.SearchNodesByNameAsync(
                request.VolumeId, request.NameHitQuery, CatalogDatabase.MaximumReadPage, cancellationToken),
            request.Iterations);
        var nameMiss = await MeasureRepeatedAsync(
            () => database.SearchNodesByNameAsync(
                request.VolumeId, request.NameMissQuery, CatalogDatabase.MaximumReadPage, cancellationToken),
            request.Iterations);
        var extensionHit = await MeasureRepeatedAsync(
            () => database.SearchNodesByExtensionAsync(
                request.VolumeId, request.Extension, CatalogDatabase.MaximumReadPage, cancellationToken),
            request.Iterations);

        var scanTimer = Stopwatch.StartNew();
        long scannedRows = 0;
        var scannedPages = 0;
        long? cursor = null;
        while (true)
        {
            var page = await database.ReadNodesPageAsync(
                request.VolumeId, cursor, CatalogDatabase.MaximumReadPage, cancellationToken);
            if (page.Count == 0) break;
            scannedRows += page.Count;
            scannedPages++;
            cursor = page[^1].FileReference;
        }
        scanTimer.Stop();

        var process = Process.GetCurrentProcess();
        process.Refresh();
        var scanMs = Milliseconds(scanTimer.Elapsed);
        return new CatalogReadOnlyReport(
            "passed",
            true,
            rowCount,
            CatalogDatabase.MaximumReadPage,
            Milliseconds(openTimer.Elapsed),
            firstPage.Count,
            firstPage.ElapsedMs,
            nameHit,
            nameMiss,
            extensionHit,
            scannedRows,
            scannedPages,
            scanMs,
            scanMs == 0 ? scannedRows : Math.Round(scannedRows * 1000d / scanMs, 1),
            databaseBytes,
            rowCount == 0 ? 0 : Math.Round((double)databaseBytes / rowCount, 1),
            process.PeakWorkingSet64,
            state.CatalogRevision);
    }

    public static string Serialize(CatalogReadOnlyReport report) =>
        JsonSerializer.Serialize(report, JsonOptions);

    private static async Task<(int Count, double ElapsedMs)> MeasureOnceAsync(
        Func<Task<IReadOnlyList<CatalogNodeRecord>>> action)
    {
        var timer = Stopwatch.StartNew();
        var rows = await action();
        timer.Stop();
        return (rows.Count, Milliseconds(timer.Elapsed));
    }

    private static async Task<CatalogLatencyMetric> MeasureRepeatedAsync(
        Func<Task<IReadOnlyList<CatalogNodeRecord>>> action,
        int iterations)
    {
        var samples = new double[iterations];
        var resultCount = 0;
        for (var index = 0; index < iterations; index++)
        {
            var sample = await MeasureOnceAsync(action);
            resultCount = sample.Count;
            samples[index] = sample.ElapsedMs;
        }
        Array.Sort(samples);
        return new CatalogLatencyMetric(
            resultCount,
            samples[(iterations - 1) / 2],
            samples[Math.Max(0, (int)Math.Ceiling(iterations * 0.95) - 1)]);
    }

    private static double Milliseconds(TimeSpan elapsed) => Math.Round(elapsed.TotalMilliseconds, 3);
}

public sealed record CatalogReadOnlyRequest(
    string DatabasePath,
    string VolumeId,
    string NameHitQuery,
    string NameMissQuery,
    string Extension,
    int Iterations)
{
    public void Validate()
    {
        RequireText(DatabasePath, 32_767, nameof(DatabasePath));
        RequireText(VolumeId, 128, nameof(VolumeId));
        RequireText(NameHitQuery, 256, nameof(NameHitQuery));
        RequireText(NameMissQuery, 256, nameof(NameMissQuery));
        RequireText(Extension, 64, nameof(Extension));
        if (Iterations is < 3 or > 50) throw new ArgumentOutOfRangeException(nameof(Iterations));
    }

    private static void RequireText(string value, int maximumLength, string name)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > maximumLength)
        {
            throw new ArgumentException($"{name} length is invalid.", name);
        }
    }
}

public sealed record CatalogLatencyMetric(int ResultCount, double P50Ms, double P95Ms);

public sealed record CatalogReadOnlyReport(
    string Status,
    bool ReadOnly,
    long Rows,
    int PageLimit,
    double OpenAndValidateMs,
    int FirstPageRows,
    double FirstPageMs,
    CatalogLatencyMetric NameHit,
    CatalogLatencyMetric NameMiss,
    CatalogLatencyMetric ExtensionHit,
    long FullScanRows,
    int FullScanPages,
    double FullScanMs,
    double FullScanRowsPerSecond,
    long DatabaseBytes,
    double DatabaseBytesPerRow,
    long PeakRssBytes,
    long CatalogRevision);

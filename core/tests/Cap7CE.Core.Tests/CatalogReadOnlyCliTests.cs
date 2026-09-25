using System.Diagnostics;
using System.Text.Json;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogReadOnlyCliTests
{
    private const string VolumeId = "synthetic-readonly-volume";
    private const string JournalId = "synthetic-readonly-journal";
    private const string HitQuery = "marker-token";
    private const string MissQuery = "definitely-absent-token";
    private const string Extension = ".png";
    private const int TotalRows = 100_000;

    public static async Task<CatalogReadOnlyReport> RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        await BuildSyntheticCatalogAsync(fixture.Database);
        var beforeState = await fixture.Database.ReadStateAsync();
        var beforeVolume = await fixture.Database.ReadVolumeAsync(VolumeId)
            ?? throw new InvalidOperationException("Synthetic volume is missing.");
        var beforeCount = await fixture.Database.CountNodesAsync(VolumeId);
        SqliteConnection.ClearAllPools();

        var (report, standardOutput, standardError) = await RunHostAsync(fixture.DatabasePath);
        TestAssert.Equal("passed", report.Status, "read-only CLI status");
        TestAssert.True(report.ReadOnly, "read-only CLI marker");
        TestAssert.Equal((long)TotalRows, report.Rows, "read-only CLI row count");
        TestAssert.Equal(CatalogDatabase.MaximumReadPage, report.PageLimit, "read-only CLI page limit");
        TestAssert.Equal(CatalogDatabase.MaximumReadPage, report.FirstPageRows, "read-only CLI first page");
        TestAssert.Equal(CatalogDatabase.MaximumReadPage, report.NameHit.ResultCount, "name hit bound");
        TestAssert.Equal(0, report.NameMiss.ResultCount, "name miss result");
        TestAssert.Equal(CatalogDatabase.MaximumReadPage, report.ExtensionHit.ResultCount, "extension hit bound");
        TestAssert.Equal((long)TotalRows, report.FullScanRows, "full scan rows");
        TestAssert.Equal(TotalRows / CatalogDatabase.MaximumReadPage, report.FullScanPages, "full scan pages");
        TestAssert.True(report.DatabaseBytes > 0, "catalog logical storage bytes");
        TestAssert.True(report.DatabaseBytesPerRow is > 0 and < 1_024, "catalog storage bytes per row bound");
        TestAssert.True(report.PeakRssBytes is > 0 and < 512L * 1024 * 1024, "read-only CLI peak RSS bound");
        TestAssert.True(report.OpenAndValidateMs < 30_000, "read-only open regression bound");
        TestAssert.True(report.FirstPageMs < 5_000, "first page regression bound");
        AssertLatency(report.NameHit, "name hit");
        AssertLatency(report.NameMiss, "name miss");
        AssertLatency(report.ExtensionHit, "extension hit");
        TestAssert.True(report.FullScanMs < 30_000, "full scan regression bound");
        TestAssert.True(report.FullScanRowsPerSecond > 0, "full scan throughput");
        TestAssert.Equal(string.Empty, standardError, "read-only CLI standard error");
        foreach (var privateValue in new[] { fixture.DatabasePath, VolumeId, HitQuery, MissQuery, Extension })
        {
            TestAssert.False(standardOutput.Contains(privateValue, StringComparison.OrdinalIgnoreCase),
                "read-only CLI output must not echo private input");
        }

        var reopened = new CatalogDatabase(fixture.DatabasePath);
        await reopened.ValidateReadOnlyAsync();
        var afterState = await reopened.ReadStateAsync();
        var afterVolume = await reopened.ReadVolumeAsync(VolumeId)
            ?? throw new InvalidOperationException("Synthetic volume disappeared.");
        TestAssert.Equal(beforeState, afterState, "read-only CLI catalog state immutability");
        TestAssert.Equal(beforeVolume, afterVolume, "read-only CLI volume immutability");
        TestAssert.Equal(beforeCount, await reopened.CountNodesAsync(VolumeId), "read-only CLI row immutability");
        return report;
    }

    private static async Task BuildSyntheticCatalogAsync(CatalogDatabase database)
    {
        await database.InitializeAsync();
        await database.RegisterVolumeAsync(VolumeId, "synthetic", JournalId);
        await database.TransitionVolumeAsync(VolumeId, CatalogVolumeState.Disabled, CatalogVolumeState.Discovering);
        var volume = await database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Discovering, CatalogVolumeState.Building);
        string? checkpoint = null;

        for (var offset = 0; offset < TotalRows; offset += CatalogDatabase.MaximumBatchNodes)
        {
            var count = Math.Min(CatalogDatabase.MaximumBatchNodes, TotalRows - offset);
            var nodes = new CatalogNodeRecord[count];
            for (var index = 0; index < count; index++)
            {
                var fileReference = offset + index + 1L;
                var extension = fileReference % 5 == 0 ? Extension : ".jpg";
                var marker = fileReference % 97 == 0 ? $"-{HitQuery}" : string.Empty;
                nodes[index] = new CatalogNodeRecord(
                    VolumeId,
                    fileReference,
                    null,
                    $"synthetic-{fileReference:D6}{marker}{extension}",
                    extension,
                    false,
                    0,
                    true,
                    1_024 + fileReference % 4_096,
                    638_900_000_000_000_000 + fileReference);
            }

            var nextCheckpoint = $"synthetic-checkpoint-{offset + count}";
            var state = await database.ApplyBatchAsync(new CatalogWriteBatch(
                VolumeId,
                JournalId,
                checkpoint,
                volume.CatalogRevision,
                nextCheckpoint,
                $"synthetic-snapshot-{offset + count}",
                nodes));
            checkpoint = nextCheckpoint;
            volume = volume with { Checkpoint = checkpoint, CatalogRevision = state.CatalogRevision };
        }
        await database.TransitionVolumeAsync(VolumeId, CatalogVolumeState.Building, CatalogVolumeState.Ready);
    }

    private static async Task<(CatalogReadOnlyReport Report, string Output, string Error)> RunHostAsync(
        string databasePath)
    {
        var hostAssembly = typeof(CoreHostScaffold).Assembly.Location;
        var startInfo = new ProcessStartInfo
        {
            FileName = "dotnet",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        startInfo.ArgumentList.Add(hostAssembly);
        startInfo.ArgumentList.Add("--catalog-readonly");
        startInfo.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1";
        startInfo.Environment["DOTNET_NOLOGO"] = "1";

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Could not start the read-only Core host.");
        var request = JsonSerializer.Serialize(new
        {
            databasePath,
            volumeId = VolumeId,
            nameHitQuery = HitQuery,
            nameMissQuery = MissQuery,
            extension = Extension,
            iterations = 7
        });
        await process.StandardInput.WriteLineAsync(request);
        await process.StandardInput.FlushAsync();
        process.StandardInput.Close();
        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();
        try
        {
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(120));
        }
        catch (TimeoutException)
        {
            process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            throw;
        }
        var output = (await outputTask).Trim();
        var error = (await errorTask).Trim();
        TestAssert.Equal(0, process.ExitCode, $"read-only CLI exit; stderr={error}");
        var report = JsonSerializer.Deserialize<CatalogReadOnlyReport>(output, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? throw new InvalidOperationException("Read-only CLI did not return a report.");
        return (report, output, error);
    }

    private static void AssertLatency(CatalogLatencyMetric metric, string name)
    {
        TestAssert.True(metric.P50Ms >= 0, $"{name} p50");
        TestAssert.True(metric.P95Ms >= metric.P50Ms, $"{name} percentile order");
        TestAssert.True(metric.P95Ms < 5_000, $"{name} regression bound");
    }
}

using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal sealed record CatalogCrashWorkerInput(
    string DatabasePath,
    string VolumeId,
    string JournalId,
    string ExpectedCheckpoint,
    long ExpectedRevision,
    string NextCheckpoint,
    string SnapshotId,
    long StartReference,
    int Count);

internal static class CatalogCrashWorker
{
    public static async Task<int> RunAsync()
    {
        var line = await Console.In.ReadLineAsync();
        var input = line is null ? null : JsonSerializer.Deserialize<CatalogCrashWorkerInput>(line);
        if (input is null || input.Count is < 1 or > 10_000) return 2;

        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = Path.GetFullPath(input.DatabasePath),
            Mode = SqliteOpenMode.ReadWrite,
            Cache = SqliteCacheMode.Private,
            Pooling = false
        }.ToString();
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();
        using (var settings = connection.CreateCommand())
        {
            settings.CommandText = """
                PRAGMA foreign_keys = ON;
                PRAGMA busy_timeout = 5000;
                PRAGMA synchronous = FULL;
                PRAGMA cache_size = 10;
                PRAGMA cache_spill = ON;
                PRAGMA wal_autocheckpoint = 0;
                PRAGMA wal_checkpoint(TRUNCATE);
                """;
            await settings.ExecuteNonQueryAsync();
        }

        using var transaction = connection.BeginTransaction();
        await VerifyExpectedStateAsync(connection, transaction, input);
        for (var index = 0; index < input.Count; index++)
        {
            using var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = """
                INSERT INTO nodes(
                    volume_id, file_reference, parent_reference, name, extension,
                    is_directory, attributes, exists_flag, size_bytes, modified_utc_ticks)
                VALUES($volumeId, $reference, NULL, $name, '.bin', 0, 0, 1, 128, 638900000000000000);
                """;
            insert.Parameters.AddWithValue("$volumeId", input.VolumeId);
            insert.Parameters.AddWithValue("$reference", input.StartReference + index);
            insert.Parameters.AddWithValue("$name", $"crash-probe-{index:D5}.bin");
            await insert.ExecuteNonQueryAsync();
        }

        var nextRevision = checked(input.ExpectedRevision + 1);
        using (var update = connection.CreateCommand())
        {
            update.Transaction = transaction;
            update.CommandText = """
                UPDATE volumes
                SET checkpoint = $checkpoint, catalog_revision = $revision
                WHERE volume_id = $volumeId;

                UPDATE catalog_state
                SET catalog_revision = $revision, committed_snapshot_id = $snapshotId
                WHERE singleton = 1;
                """;
            update.Parameters.AddWithValue("$checkpoint", input.NextCheckpoint);
            update.Parameters.AddWithValue("$revision", nextRevision);
            update.Parameters.AddWithValue("$volumeId", input.VolumeId);
            update.Parameters.AddWithValue("$snapshotId", input.SnapshotId);
            if (await update.ExecuteNonQueryAsync() != 2) return 3;
        }

        var walPath = input.DatabasePath + "-wal";
        var walBytes = File.Exists(walPath) ? new FileInfo(walPath).Length : 0;
        await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
        {
            status = "transaction-open",
            inserted = input.Count,
            walBytes
        }));
        await Console.Out.FlushAsync();
        await Task.Delay(Timeout.InfiniteTimeSpan);
        return 0;
    }

    public static async Task OpenTransactionAndCrashAsync(CatalogCrashWorkerInput input)
    {
        var assemblyPath = Assembly.GetExecutingAssembly().Location;
        var startInfo = new ProcessStartInfo
        {
            FileName = "dotnet",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        startInfo.ArgumentList.Add(assemblyPath);
        startInfo.ArgumentList.Add("--catalog-crash-worker");
        startInfo.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1";
        startInfo.Environment["DOTNET_NOLOGO"] = "1";

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Could not start the catalog crash worker.");
        try
        {
            await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(input));
            await process.StandardInput.FlushAsync();
            process.StandardInput.Close();
            var readyLine = await process.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(15));
            if (readyLine is null) throw new InvalidOperationException("Catalog crash worker ended before opening a transaction.");
            using var ready = JsonDocument.Parse(readyLine);
            TestAssert.Equal("transaction-open", ready.RootElement.GetProperty("status").GetString(),
                "catalog crash worker readiness");
            TestAssert.Equal(input.Count, ready.RootElement.GetProperty("inserted").GetInt32(),
                "catalog crash worker inserted count");
            TestAssert.True(ready.RootElement.GetProperty("walBytes").GetInt64() > 0,
                "catalog crash worker uncommitted WAL bytes");
            process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10));
        }
        finally
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                await process.WaitForExitAsync();
            }
        }
    }

    private static async Task VerifyExpectedStateAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        CatalogCrashWorkerInput input)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT c.catalog_revision, v.journal_id, v.checkpoint, v.state
            FROM catalog_state c
            JOIN volumes v ON v.volume_id = $volumeId
            WHERE c.singleton = 1;
            """;
        command.Parameters.AddWithValue("$volumeId", input.VolumeId);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()
            || reader.GetInt64(0) != input.ExpectedRevision
            || !string.Equals(reader.GetString(1), input.JournalId, StringComparison.Ordinal)
            || !string.Equals(reader.GetString(2), input.ExpectedCheckpoint, StringComparison.Ordinal)
            || !string.Equals(reader.GetString(3), "building", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Catalog crash worker received stale fixture state.");
        }
    }
}

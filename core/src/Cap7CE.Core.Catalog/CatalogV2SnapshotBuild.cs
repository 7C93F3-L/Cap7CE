using System.Diagnostics;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

public sealed record CatalogV2SnapshotBuildMetrics(
    long Records,
    int Pages,
    double StagingWriteMilliseconds,
    double DirectoryPathMilliseconds,
    double PublishMilliseconds,double EntryStagingMilliseconds=0);

public sealed record CatalogV2SnapshotBuildResult(
    CatalogV2VolumeSnapshot Volume,
    CatalogV2SnapshotBuildMetrics Metrics);

public sealed partial class CatalogV2SnapshotBuild : IAsyncDisposable
{
    private readonly CatalogV2Database owner;
    private readonly string volumeId;
    private readonly string databasePath;
    private readonly SqliteConnection connection;
    private readonly SqliteTransaction transaction;
    private readonly Dictionary<string, CatalogV2DirectorySeed> directories = new(StringComparer.Ordinal);
    private long records;
    private int pages;
    private double stagingWriteMilliseconds;
    private bool nodesCommitted;
    private bool completed;
    private bool published;
    private bool disposed;

    private CatalogV2SnapshotBuild(
        CatalogV2Database owner,
        string volumeId,
        string databasePath,
        SqliteConnection connection,
        SqliteTransaction transaction)
    {
        this.owner = owner;
        this.volumeId = volumeId;
        this.databasePath = databasePath;
        this.connection = connection;
        this.transaction = transaction;
    }

    internal static async Task<CatalogV2SnapshotBuild> CreateAsync(
        CatalogV2Database owner,
        string volumeId,
        string databasePath,
        CancellationToken token, bool captureFileEntries, long expectedVolumeRevision)
    {
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Private,
            Pooling = false
        }.ToString());
        try
        {
            await connection.OpenAsync(token);
            using (var initialize = connection.CreateCommand())
            {
                initialize.CommandText = """
                    PRAGMA journal_mode = OFF;
                    PRAGMA synchronous = OFF;
                    PRAGMA temp_store = MEMORY;
                    PRAGMA trusted_schema = OFF;
                    CREATE TABLE build_nodes (
                        volume_id TEXT NOT NULL,
                        file_reference TEXT NOT NULL,
                        parent_file_reference TEXT NULL,
                        name TEXT NOT NULL,
                        extension TEXT NOT NULL,
                        is_directory INTEGER NOT NULL,
                        attributes INTEGER NOT NULL,
                        exists_flag INTEGER NOT NULL,
                        size_bytes INTEGER NULL,
                        created_utc_ticks INTEGER NULL,
                        modified_utc_ticks INTEGER NULL,
                        PRIMARY KEY (volume_id, file_reference)
                    ) STRICT, WITHOUT ROWID;
                    CREATE TABLE build_paths (
                        volume_id TEXT NOT NULL,
                        file_reference TEXT NOT NULL,
                        relative_path TEXT NOT NULL,
                        PRIMARY KEY (volume_id, file_reference)
                    ) STRICT, WITHOUT ROWID;
                    """;
                await initialize.ExecuteNonQueryAsync(token);
            }
            if (captureFileEntries) await DirectoryEntries.CatalogFileEntryStaging.CreateAsync(connection, token);
            return new CatalogV2SnapshotBuild(
                owner,
                volumeId,
                databasePath,
                connection,
                connection.BeginTransaction()) { CaptureFileEntries = captureFileEntries, ExpectedVolumeRevision = expectedVolumeRevision };
        }
        catch
        {
            try {
                await connection.DisposeAsync();
                CatalogV2Database.DeleteSnapshotBuildFiles(databasePath);
            } finally {await RetireAsync(owner,volumeId,expectedVolumeRevision);}
            throw;
        }
    }

    public async Task AppendAsync(
        IReadOnlyList<CatalogV2NodeRecord> nodes,
        CancellationToken token = default)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (completed || nodesCommitted) throw new InvalidOperationException("Catalog snapshot build is already complete.");
        CatalogV2Database.ValidateSnapshotNodes(volumeId, nodes);
        var watch = Stopwatch.StartNew();
        await CatalogV2Database.UpsertNodesAsync(
            connection,
            transaction,
            "build_nodes",
            nodes,
            token);
        watch.Stop();
        stagingWriteMilliseconds += watch.Elapsed.TotalMilliseconds;
        records = checked(records + nodes.Count);
        pages++;
        foreach (var node in nodes)
        {
            if (node.Exists && node.IsDirectory)
            {
                directories[node.Identity.FileReference] = new CatalogV2DirectorySeed(
                    node.Identity.FileReference,
                    node.ParentFileReference,
                    node.Name);
            }
        }
    }

    public async Task<CatalogV2SnapshotBuildResult> PublishAsync(CancellationToken token = default)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (completed || nodesCommitted) throw new InvalidOperationException("Catalog snapshot build is already complete.");

        if (CaptureFileEntries) await DirectoryEntries.CatalogSnapshotEntryParents.DeferAsync(connection, transaction, volumeId, token);
        await transaction.CommitAsync(token);
        nodesCommitted = true;

        var pathWatch = Stopwatch.StartNew();
        var paths = CatalogV2Database.ResolveDirectoryPaths(directories);
        await using (var pathTransaction = connection.BeginTransaction())
        {
            await CatalogV2Database.InsertDirectoryPathsAsync(
                connection,
                pathTransaction,
                "build_paths",
                volumeId,
                paths,
                token);
            await pathTransaction.CommitAsync(token);
        }
        pathWatch.Stop();

        await connection.CloseAsync();
        var publishWatch = Stopwatch.StartNew();
        var volume = await owner.PublishSnapshotBuildAsync(volumeId, databasePath, records, token, CaptureFileEntries, ExpectedVolumeRevision);
        publishWatch.Stop();
        completed = true;
        published = true;
        CatalogV2Database.DeleteSnapshotBuildFiles(databasePath);
        return new CatalogV2SnapshotBuildResult(
            volume,
            new CatalogV2SnapshotBuildMetrics(
                records,
                pages,
                Math.Round(stagingWriteMilliseconds, 3),
                Math.Round(pathWatch.Elapsed.TotalMilliseconds, 3),
                Math.Round(publishWatch.Elapsed.TotalMilliseconds, 3),Math.Round(entryStagingMilliseconds,3)));
    }

    public async ValueTask DisposeAsync()
    {
        if (disposed) return;
        disposed = true;
        try {
            if (!nodesCommitted)
            {
                try { await transaction.RollbackAsync(CancellationToken.None); }
                catch (InvalidOperationException) { }
            }
            await transaction.DisposeAsync();
            await connection.DisposeAsync();
            CatalogV2Database.DeleteSnapshotBuildFiles(databasePath);
        } finally {if(!published)await RetireAsync(owner,volumeId,ExpectedVolumeRevision);}
    }

    private static async Task RetireAsync(CatalogV2Database catalog,string volumeId,long revision)
    {
        using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(2));
        try{await catalog.RecoverInterruptedBuildAsync(volumeId,revision,timeout.Token);}
        catch(OperationCanceledException){} // Startup under the product lease retries stale states.
        catch(SqliteException){} // Cleanup must not replace the original Reader/page failure.
    }
}

internal sealed record CatalogV2DirectorySeed(
    string FileReference,
    string? ParentFileReference,
    string Name);

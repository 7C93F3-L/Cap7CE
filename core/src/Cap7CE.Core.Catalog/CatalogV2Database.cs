using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

public sealed class CatalogV2Database
{
    private const int NodeWriteChunkSize = 64;
    private readonly string databasePath;

    public CatalogV2Database(string databasePath)
    {
        if (string.IsNullOrWhiteSpace(databasePath))
        {
            throw new ArgumentException("Database path is required.", nameof(databasePath));
        }
        this.databasePath = Path.GetFullPath(databasePath);
    }

    public string DatabasePath => databasePath;

    public async Task InitializeAsync(CancellationToken token = default)
    {
        var directory = Path.GetDirectoryName(databasePath)
            ?? throw new ArgumentException("Database path has no parent directory.");
        Directory.CreateDirectory(directory);
        CleanupAbandonedSnapshotBuilds(directory, Path.GetFileName(databasePath));
        await using var connection = await OpenAsync(false, token);
        await CatalogV2Schema.InitializeAsync(connection, token);
        using var wal = connection.CreateCommand();
        wal.CommandText = "PRAGMA journal_mode = WAL;";
        if (!string.Equals(Convert.ToString(await wal.ExecuteScalarAsync(token)), "wal", StringComparison.OrdinalIgnoreCase))
        {
            throw new CatalogSchemaException("Catalog v2 could not enable WAL mode.");
        }
        if (!await CheckIntegrityAsync(connection, token))
        {
            throw new CatalogSchemaException("Catalog v2 integrity check failed.");
        }
    }

    public async Task<long> ReadRevisionAsync(CancellationToken token = default)
    {
        await using var connection = await OpenAsync(true, token);
        return await ReadRevisionAsync(connection, null, token);
    }

    public async Task<bool> CheckIntegrityAsync(CancellationToken token = default)
    {
        await using var connection = await OpenAsync(true, token);
        return await CheckIntegrityAsync(connection, token);
    }

    public async Task<long> ReadStorageBytesAsync(CancellationToken token = default)
    {
        await using var connection = await OpenAsync(true, token);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT (SELECT page_count FROM pragma_page_count()) * (SELECT page_size FROM pragma_page_size());";
        return Convert.ToInt64(await command.ExecuteScalarAsync(token));
    }

    public async Task<CatalogV2VolumeSnapshot> RegisterVolumeAsync(
        string volumeId,
        string displayName,
        string fileSystem,
        bool selected,
        CancellationToken token = default)
    {
        RequireText(volumeId, 64, nameof(volumeId));
        RequireText(displayName, 32, nameof(displayName));
        RequireText(fileSystem, 16, nameof(fileSystem));
        await using var connection = await OpenAsync(false, token);
        using var transaction = connection.BeginTransaction();
        var existing = await ReadVolumeAsync(connection, transaction, volumeId, token);
        if (existing is not null
            && string.Equals(existing.DisplayName, displayName, StringComparison.Ordinal)
            && string.Equals(existing.FileSystem, fileSystem, StringComparison.Ordinal)
            && existing.Selected == selected)
        {
            transaction.Commit();
            return existing;
        }
        var current = await ReadRevisionAsync(connection, transaction, token);
        var revision = NextRevision(current);
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO catalog_volumes_v2(
                volume_id, display_name, file_system, selected, journal_id, checkpoint_usn,
                journal_first_usn, journal_lowest_valid_usn, state, processed, total, catalog_revision)
            VALUES($volume, $display, $fileSystem, $selected, NULL, NULL, NULL, NULL, 'disabled', 0, NULL, $revision)
            ON CONFLICT(volume_id) DO UPDATE SET
                display_name = excluded.display_name,
                file_system = excluded.file_system,
                selected = excluded.selected,
                catalog_revision = $revision;
            UPDATE catalog_state_v2 SET catalog_revision = $revision WHERE singleton = 1;
            """;
        command.Parameters.AddWithValue("$volume", volumeId);
        command.Parameters.AddWithValue("$display", displayName);
        command.Parameters.AddWithValue("$fileSystem", fileSystem);
        command.Parameters.AddWithValue("$selected", selected ? 1 : 0);
        command.Parameters.AddWithValue("$revision", revision);
        await command.ExecuteNonQueryAsync(token);
        transaction.Commit();
        return (await ReadVolumeAsync(volumeId, token))!;
    }

    public async Task SetVolumeSelectionAsync(
        IReadOnlyList<string> selectedVolumeIds,
        CancellationToken token = default)
    {
        ArgumentNullException.ThrowIfNull(selectedVolumeIds);
        if (selectedVolumeIds.Count > 32 || selectedVolumeIds.Distinct(StringComparer.Ordinal).Count() != selectedVolumeIds.Count)
        {
            throw new ArgumentException("Volume selection is invalid.", nameof(selectedVolumeIds));
        }
        foreach (var id in selectedVolumeIds) RequireText(id, 64, nameof(selectedVolumeIds));
        await using var connection = await OpenAsync(false, token);
        using var transaction = connection.BeginTransaction();
        var revision = NextRevision(await ReadRevisionAsync(connection, transaction, token));
        using (var clear = connection.CreateCommand())
        {
            clear.Transaction = transaction;
            clear.CommandText = "UPDATE catalog_volumes_v2 SET selected = 0, catalog_revision = $revision;";
            clear.Parameters.AddWithValue("$revision", revision);
            await clear.ExecuteNonQueryAsync(token);
        }
        foreach (var id in selectedVolumeIds)
        {
            using var select = connection.CreateCommand();
            select.Transaction = transaction;
            select.CommandText = "UPDATE catalog_volumes_v2 SET selected = 1 WHERE volume_id = $volume;";
            select.Parameters.AddWithValue("$volume", id);
            if (await select.ExecuteNonQueryAsync(token) != 1)
            {
                throw new CatalogConcurrencyException("Selected catalog volume is not registered.");
            }
        }
        await SetRevisionAsync(connection, transaction, revision, token);
        transaction.Commit();
    }

    public async Task<IReadOnlyList<CatalogV2VolumeSnapshot>> ReadVolumesAsync(CancellationToken token = default)
    {
        await using var connection = await OpenAsync(true, token);
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT volume_id, display_name, file_system, selected, journal_id, checkpoint_usn,
                   journal_first_usn, journal_lowest_valid_usn, state, processed, total, catalog_revision
            FROM catalog_volumes_v2 ORDER BY display_name COLLATE NOCASE, volume_id;
            """;
        var values = new List<CatalogV2VolumeSnapshot>();
        await using var reader = await command.ExecuteReaderAsync(token);
        while (await reader.ReadAsync(token)) values.Add(ReadVolume(reader));
        return values;
    }

    public async Task<CatalogV2VolumeSnapshot?> ReadVolumeAsync(
        string volumeId,
        CancellationToken token = default)
    {
        RequireText(volumeId, 64, nameof(volumeId));
        await using var connection = await OpenAsync(true, token);
        return await ReadVolumeAsync(connection, null, volumeId, token);
    }

    public async Task<CatalogV2VolumeSnapshot> BeginBuildAsync(
        string volumeId,
        string journalId,
        long checkpointUsn,
        long journalFirstUsn,
        long journalLowestValidUsn,
        long? total,
        bool rebuild,
        CancellationToken token = default)
    {
        RequireText(volumeId, 64, nameof(volumeId));
        RequireText(journalId, 32, nameof(journalId));
        RequireNonNegative(checkpointUsn, nameof(checkpointUsn));
        RequireNonNegative(journalFirstUsn, nameof(journalFirstUsn));
        RequireNonNegative(journalLowestValidUsn, nameof(journalLowestValidUsn));
        if (total < 0) throw new ArgumentOutOfRangeException(nameof(total));
        await using var connection = await OpenAsync(false, token);
        using var transaction = connection.BeginTransaction();
        var volume = await ReadVolumeAsync(connection, transaction, volumeId, token)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        if ((!rebuild && volume.State != CatalogV2VolumeState.Disabled)
            || (rebuild && volume.State != CatalogV2VolumeState.NeedsRebuild))
        {
            throw new CatalogStateTransitionException("Catalog volume is not ready to build.");
        }
        await FileFacts.FileFactCatalogInvalidation.ApplyVolumeAsync(connection, transaction, volumeId, token);
        var revision = NextRevision(await ReadRevisionAsync(connection, transaction, token));
        using (var update = connection.CreateCommand())
        {
            update.Transaction = transaction;
            update.CommandText = """
                UPDATE catalog_volumes_v2
                SET journal_id = $journal, checkpoint_usn = $checkpoint,
                    journal_first_usn = $first, journal_lowest_valid_usn = $lowest,
                    state = 'building', processed = 0, total = $total, catalog_revision = $revision
                WHERE volume_id = $volume;
                """;
            update.Parameters.AddWithValue("$journal", journalId);
            update.Parameters.AddWithValue("$checkpoint", checkpointUsn);
            update.Parameters.AddWithValue("$first", journalFirstUsn);
            update.Parameters.AddWithValue("$lowest", journalLowestValidUsn);
            update.Parameters.AddWithValue("$total", (object?)total ?? DBNull.Value);
            update.Parameters.AddWithValue("$revision", revision);
            update.Parameters.AddWithValue("$volume", volumeId);
            await update.ExecuteNonQueryAsync(token);
        }
        await SetRevisionAsync(connection, transaction, revision, token);
        transaction.Commit();
        return (await ReadVolumeAsync(volumeId, token))!;
    }

    public async Task<CatalogV2SnapshotBuild> BeginSnapshotBuildAsync(
        string volumeId,
        string journalId,
        long checkpointUsn,
        long journalFirstUsn,
        long journalLowestValidUsn,
        long? total,
        bool rebuild,
        CancellationToken token = default)
    {
        _ = await BeginBuildAsync(
            volumeId,
            journalId,
            checkpointUsn,
            journalFirstUsn,
            journalLowestValidUsn,
            total,
            rebuild,
            token);
        var snapshotPath = databasePath + ".snapshot-" + Guid.NewGuid().ToString("N") + ".db";
        return await CatalogV2SnapshotBuild.CreateAsync(this, volumeId, snapshotPath, token);
    }

    public async Task<CatalogV2VolumeSnapshot> BeginCatchUpAsync(
        string volumeId,
        string journalId,
        long journalFirstUsn,
        long journalLowestValidUsn,
        CancellationToken token = default)
    {
        var volume = await ReadVolumeAsync(volumeId, token)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        var continuous = volume.State is CatalogV2VolumeState.Ready or CatalogV2VolumeState.Offline
            && string.Equals(volume.JournalId, journalId, StringComparison.Ordinal)
            && volume.CheckpointUsn is long checkpoint
            && checkpoint >= journalFirstUsn
            && checkpoint >= journalLowestValidUsn;
        return continuous
            ? await ChangeStateAsync(volumeId, volume.State, CatalogV2VolumeState.CatchingUp, token)
            : await MarkNeedsRebuildAsync(volumeId, token);
    }

    public async Task<CatalogV2VolumeSnapshot> MarkOfflineAsync(
        string volumeId,
        CancellationToken token = default)
    {
        var volume = await ReadVolumeAsync(volumeId, token)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        return volume.State == CatalogV2VolumeState.Offline
            ? volume
            : await ChangeStateAsync(volumeId, volume.State, CatalogV2VolumeState.Offline, token);
    }

    public async Task<CatalogV2VolumeSnapshot> MarkNeedsRebuildAsync(
        string volumeId,
        CancellationToken token = default)
    {
        var volume = await ReadVolumeAsync(volumeId, token)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        return volume.State == CatalogV2VolumeState.NeedsRebuild
            ? volume
            : await ChangeStateAsync(volumeId, volume.State, CatalogV2VolumeState.NeedsRebuild, token);
    }

    public async Task<CatalogV2VolumeSnapshot> CompleteSynchronizationAsync(
        string volumeId,
        CancellationToken token = default)
    {
        var volume = await ReadVolumeAsync(volumeId, token)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        if (volume.State is not (CatalogV2VolumeState.Building or CatalogV2VolumeState.CatchingUp))
        {
            throw new CatalogStateTransitionException("Catalog volume is not synchronizing.");
        }
        await using var connection = await OpenAsync(false, token);
        using var transaction = connection.BeginTransaction();
        await RebuildDirectoryPathsAsync(connection, transaction, volumeId, token);
        var revision = NextRevision(await ReadRevisionAsync(connection, transaction, token));
        using var update = connection.CreateCommand();
        update.Transaction = transaction;
        update.CommandText = """
            UPDATE catalog_volumes_v2 SET state = 'ready', processed = COALESCE(total, processed),
                catalog_revision = $revision WHERE volume_id = $volume AND state IN ('building', 'catchingUp');
            """;
        update.Parameters.AddWithValue("$revision", revision);
        update.Parameters.AddWithValue("$volume", volumeId);
        if (await update.ExecuteNonQueryAsync(token) != 1)
        {
            throw new CatalogConcurrencyException("Catalog synchronization state changed before commit.");
        }
        await SetRevisionAsync(connection, transaction, revision, token);
        transaction.Commit();
        return (await ReadVolumeAsync(volumeId, token))!;
    }

    internal async Task<CatalogV2VolumeSnapshot> PublishSnapshotBuildAsync(
        string volumeId,
        string snapshotPath,
        long recordCount,
        CancellationToken token)
    {
        RequireText(volumeId, 64, nameof(volumeId));
        RequireNonNegative(recordCount, nameof(recordCount));
        await using var connection = await OpenAsync(false, token);
        using (var attach = connection.CreateCommand())
        {
            attach.CommandText = "ATTACH DATABASE $path AS snapshot_build;";
            attach.Parameters.AddWithValue("$path", snapshotPath);
            await attach.ExecuteNonQueryAsync(token);
        }
        try
        {
            using var transaction = connection.BeginTransaction();
            var volume = await ReadVolumeAsync(connection, transaction, volumeId, token)
                ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
            if (volume.State != CatalogV2VolumeState.Building)
            {
                throw new CatalogStateTransitionException("Catalog snapshot can publish only while building.");
            }

            using (var publish = connection.CreateCommand())
            {
                publish.Transaction = transaction;
                publish.CommandText = """
                    INSERT INTO catalog_nodes_v2(
                        volume_id, file_reference, parent_file_reference, name, extension,
                        is_directory, attributes, exists_flag, size_bytes, created_utc_ticks, modified_utc_ticks)
                    SELECT volume_id, file_reference, parent_file_reference, name, extension,
                           is_directory, attributes, exists_flag, size_bytes, created_utc_ticks, modified_utc_ticks
                    FROM snapshot_build.build_nodes WHERE volume_id = $volume
                    ON CONFLICT(volume_id, file_reference) DO UPDATE SET
                        parent_file_reference = excluded.parent_file_reference,
                        name = excluded.name,
                        extension = excluded.extension,
                        is_directory = excluded.is_directory,
                        attributes = excluded.attributes,
                        exists_flag = excluded.exists_flag,
                        size_bytes = excluded.size_bytes,
                        created_utc_ticks = excluded.created_utc_ticks,
                        modified_utc_ticks = excluded.modified_utc_ticks;

                    DELETE FROM catalog_nodes_v2
                    WHERE volume_id = $volume
                      AND NOT EXISTS(
                          SELECT 1 FROM snapshot_build.build_nodes staged
                          WHERE staged.volume_id = catalog_nodes_v2.volume_id
                            AND staged.file_reference = catalog_nodes_v2.file_reference);

                    DELETE FROM catalog_directory_paths_v2 WHERE volume_id = $volume;
                    INSERT INTO catalog_directory_paths_v2(volume_id, file_reference, relative_path)
                    SELECT volume_id, file_reference, relative_path
                    FROM snapshot_build.build_paths WHERE volume_id = $volume;
                    """;
                publish.Parameters.AddWithValue("$volume", volumeId);
                await publish.ExecuteNonQueryAsync(token);
            }

            var revision = NextRevision(await ReadRevisionAsync(connection, transaction, token));
            using (var update = connection.CreateCommand())
            {
                update.Transaction = transaction;
                update.CommandText = """
                    UPDATE catalog_volumes_v2
                    SET state = 'ready', processed = $count, total = COALESCE(total, $count),
                        catalog_revision = $revision
                    WHERE volume_id = $volume AND state = 'building';
                    """;
                update.Parameters.AddWithValue("$count", recordCount);
                update.Parameters.AddWithValue("$revision", revision);
                update.Parameters.AddWithValue("$volume", volumeId);
                if (await update.ExecuteNonQueryAsync(token) != 1)
                {
                    throw new CatalogConcurrencyException("Catalog build state changed before publish.");
                }
            }
            await SetRevisionAsync(connection, transaction, revision, token);
            transaction.Commit();
        }
        finally
        {
            using var detach = connection.CreateCommand();
            detach.CommandText = "DETACH DATABASE snapshot_build;";
            await detach.ExecuteNonQueryAsync(CancellationToken.None);
        }
        return (await ReadVolumeAsync(volumeId, token))!;
    }

    public Task<CatalogV2VolumeSnapshot> ApplyBatchAsync(CatalogV2WriteBatch batch, CancellationToken token = default)
        => ApplyBatchCoreAsync(batch, false, token);

    // An external event publishes its checkpoint and any staged owned directory
    // ancestry atomically, without readiness-state writes around each page.
    public Task<CatalogV2VolumeSnapshot> ApplyMaintenanceBatchAsync(CatalogV2WriteBatch batch, CancellationToken token = default)
        => ApplyBatchCoreAsync(batch, true, token);

    private async Task<CatalogV2VolumeSnapshot> ApplyBatchCoreAsync(
        CatalogV2WriteBatch batch,
        bool maintenance,
        CancellationToken token)
    {
        ValidateBatch(batch);
        if (maintenance && (batch.Nodes.Count == 0 || batch.Nodes.All(node => node.SuppressFileFactChangeHint)
            || batch.ExpectedCheckpointUsn is not { } expected || batch.NextCheckpointUsn <= expected))
            throw new ArgumentException("Maintenance requires an external change and an advancing durable checkpoint.", nameof(batch));
        await using var connection = await OpenAsync(false, token);
        using var transaction = connection.BeginTransaction();
        var volume = await ReadVolumeAsync(connection, transaction, batch.VolumeId, token)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        var revision = await ReadRevisionAsync(connection, transaction, token);
        if (revision != batch.ExpectedCatalogRevision
            || !string.Equals(volume.JournalId, batch.ExpectedJournalId, StringComparison.Ordinal)
            || volume.CheckpointUsn != batch.ExpectedCheckpointUsn)
        {
            throw new CatalogConcurrencyException("Catalog v2 batch is stale.");
        }
        if (maintenance ? volume.State != CatalogV2VolumeState.Ready
            : volume.State is not (CatalogV2VolumeState.Building or CatalogV2VolumeState.CatchingUp))
        {
            throw new CatalogStateTransitionException("Catalog v2 accepts batches only while synchronizing.");
        }

        var pathsChanged = (maintenance || volume.State == CatalogV2VolumeState.CatchingUp)
            && await CatalogDirectoryPathChanges.RequiresRebuildAsync(connection, transaction, batch.Nodes, token);
        await FileFacts.FileFactCatalogInvalidation.ApplyNodesAsync(connection, transaction, batch.Nodes, token);
        await UpsertNodesAsync(connection, transaction, "catalog_nodes_v2", batch.Nodes, token);
        if (maintenance || volume.State == CatalogV2VolumeState.CatchingUp)
            await FileFacts.FileFactChangeLog.RecordAsync(connection, transaction, batch.Nodes, token);
        if (pathsChanged)
        {
            await RebuildDirectoryPathsAsync(connection, transaction, batch.VolumeId, token);
        }
        var nextRevision = NextRevision(revision);
        using (var update = connection.CreateCommand())
        {
            update.Transaction = transaction;
            update.CommandText = """
                UPDATE catalog_volumes_v2
                SET checkpoint_usn = $checkpoint, journal_first_usn = $first,
                    journal_lowest_valid_usn = $lowest, processed = processed + $count,
                    catalog_revision = $revision
                WHERE volume_id = $volume;
                """;
            update.Parameters.AddWithValue("$checkpoint", batch.NextCheckpointUsn);
            update.Parameters.AddWithValue("$first", (object?)batch.JournalFirstUsn ?? DBNull.Value);
            update.Parameters.AddWithValue("$lowest", (object?)batch.JournalLowestValidUsn ?? DBNull.Value);
            update.Parameters.AddWithValue("$count", batch.Nodes.Count);
            update.Parameters.AddWithValue("$revision", nextRevision);
            update.Parameters.AddWithValue("$volume", batch.VolumeId);
            await update.ExecuteNonQueryAsync(token);
        }
        await SetRevisionAsync(connection, transaction, nextRevision, token);
        transaction.Commit();
        return (await ReadVolumeAsync(batch.VolumeId, token))!;
    }

    public async Task SaveScopeAsync(CatalogSavedScope scope, CancellationToken token = default)
    {
        ArgumentNullException.ThrowIfNull(scope);
        RequireText(scope.ScopeId, 128, nameof(scope.ScopeId));
        ValidateIdentity(scope.Root);
        RequireNonNegative(scope.CreatedUtcTicks, nameof(scope.CreatedUtcTicks));
        await using var connection = await OpenAsync(false, token);
        using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO catalog_saved_scopes_v2(scope_id, volume_id, root_file_reference, created_utc_ticks)
            VALUES($scope, $volume, $root, $created)
            ON CONFLICT(scope_id) DO UPDATE SET volume_id = excluded.volume_id,
                root_file_reference = excluded.root_file_reference,
                created_utc_ticks = excluded.created_utc_ticks;
            """;
        command.Parameters.AddWithValue("$scope", scope.ScopeId);
        command.Parameters.AddWithValue("$volume", scope.Root.VolumeId);
        command.Parameters.AddWithValue("$root", scope.Root.FileReference);
        command.Parameters.AddWithValue("$created", scope.CreatedUtcTicks);
        await command.ExecuteNonQueryAsync(token);
    }

    public async Task<CatalogV2QueryPage> QueryAsync(
        CatalogV2Query query,
        CancellationToken token = default)
    {
        ValidateQuery(query);
        await using var connection = await OpenAsync(true, token);
        Queries.CatalogRandomOrdering.Configure(connection, query);
        return await Queries.CatalogQueryExecution.RunAsync(connection, token,
            () => ReadQueryPageAsync(connection, query, token));
    }

    private static async Task<CatalogV2QueryPage> ReadQueryPageAsync(
        SqliteConnection connection, CatalogV2Query query, CancellationToken token)
    {
        if (query.Facts is not null)
        {
            FileFacts.FileFactQuerySql.Validate(query.Facts);
        }
        using var transaction = connection.BeginTransaction(deferred: true);
        var revision = await ReadRevisionAsync(connection, transaction, token);
        long? factRevision = null;
        var factsAvailable = true;
        if (query.Facts is not null)
        {
            using var factState = connection.CreateCommand();
            factState.Transaction = transaction;
            factState.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE name GLOB 'file_fact_*';";
            factsAvailable = Convert.ToInt32(await factState.ExecuteScalarAsync(token)) != 0;
            if (factsAvailable)
            {
                await FileFacts.FileFactSchema.ValidateAsync(connection, token);
                factState.CommandText = "SELECT fact_revision FROM file_fact_state WHERE singleton = 1;";
                factRevision = Convert.ToInt64(await factState.ExecuteScalarAsync(token));
            }
            else factRevision = 0;
        }
        if (query.ExpectedRevision is { } expected
            && (expected.CatalogRevision != revision || (expected.FactRevision is not null && expected.FactRevision != factRevision)))
            throw new CatalogConcurrencyException("Catalog query revision changed.");
        if (!factsAvailable) return new([], null, revision, factRevision);
        var factPlan = await FileFacts.FileFactQuerySql.ChoosePlanAsync(query, connection, transaction, token);
        const string pathExpression = "CASE WHEN n.is_directory = 1 THEN COALESCE(dp.relative_path, n.name) "
            + "WHEN pp.relative_path IS NULL OR pp.relative_path = '' THEN n.name "
            + "ELSE pp.relative_path || '\\' || n.name END";
        var terms = query.Query.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        var sql = new StringBuilder("""
            WITH RECURSIVE scope_nodes(volume_id, file_reference) AS (
            """);
        AppendScopeSql(sql, command, query.Scope);
        sql.Append("""
            ),
            matched_keys(volume_id, file_reference, name, modified_utc_ticks, is_directory) AS MATERIALIZED (
            SELECT n.volume_id, n.file_reference, n.name, n.modified_utc_ticks, n.is_directory
            """);
        FileFacts.FileFactQuerySql.AppendSource(sql, factPlan);
        if (query.Scope.Kind != CatalogQueryScopeKind.AllVolumes)
        {
            sql.Append(" JOIN scope_nodes sn ON sn.volume_id = n.volume_id AND sn.file_reference = n.file_reference ");
        }
        if (query.Facts is not null) FileFacts.FileFactQuerySql.AppendJoin(sql, factPlan);
        if (query.TextTarget != CatalogQueryTextTarget.Name)
            sql.Append(" LEFT JOIN catalog_directory_paths_v2 dp ON dp.volume_id = n.volume_id AND dp.file_reference = n.file_reference LEFT JOIN catalog_directory_paths_v2 pp ON pp.volume_id = n.volume_id AND pp.file_reference = n.parent_file_reference ");
        sql.Append(" WHERE n.exists_flag = 1 AND v.selected = 1 AND v.state IN ('ready', 'catchingUp') ");
        if (query.Facts is not null) FileFacts.FileFactQuerySql.AppendPredicate(sql, command, query.Facts);
        if (query.FileConditions is not null) CatalogFileConditionSql.Append(sql, command, query.FileConditions);
        if (query.ExcludeHidden) sql.Append(" AND (n.attributes & 2) = 0 ");
        if (query.VolumeIds.Count > 0)
        {
            sql.Append(" AND n.volume_id IN (");
            for (var index = 0; index < query.VolumeIds.Count; index++)
            {
                if (index > 0) sql.Append(',');
                sql.Append("$volume").Append(index);
                command.Parameters.AddWithValue("$volume" + index, query.VolumeIds[index]);
            }
            sql.Append(')');
        }
        if (query.Extension is not null)
        {
            sql.Append(" AND n.extension = $extension COLLATE NOCASE");
            command.Parameters.AddWithValue("$extension", query.Extension);
        }
        if (query.EntryType != CatalogEntryType.Any)
        {
            sql.Append(" AND n.is_directory = $directory");
            command.Parameters.AddWithValue("$directory", query.EntryType == CatalogEntryType.Directory ? 1 : 0);
        }
        for (var index = 0; index < terms.Length; index++)
        {
            var parameter = "$term" + index;
            var nameMatch = $"n.name LIKE {parameter} ESCAPE '\\' COLLATE NOCASE";
            var pathMatch = $"(v.display_name || '\\' || ({pathExpression})) LIKE {parameter} ESCAPE '\\' COLLATE NOCASE";
            sql.Append(" AND (").Append(query.TextTarget switch
            {
                CatalogQueryTextTarget.Name => nameMatch,
                CatalogQueryTextTarget.Path => pathMatch,
                _ => nameMatch + " OR " + pathMatch
            }).Append(')');
            command.Parameters.AddWithValue("$term" + index, "%" + EscapeLike(terms[index]) + "%");
        }
        CatalogQueryOrdering.AppendAfter(sql, command, query);
        sql.Append(" ORDER BY ").Append(CatalogQueryOrdering.Order(query, "n")).Append(" LIMIT $limit");
        command.Parameters.AddWithValue("$limit", query.PageSize + 1);
        sql.Append("""
            )
            SELECT n.volume_id, n.file_reference, n.name,
            """);
        sql.Append(pathExpression);
        sql.Append("""
             AS relative_path,
                   n.extension, n.is_directory, n.attributes, n.size_bytes,
                   n.created_utc_ticks, n.modified_utc_ticks
            FROM matched_keys m
            JOIN catalog_nodes_v2 n
                ON n.volume_id = m.volume_id AND n.file_reference = m.file_reference
            LEFT JOIN catalog_directory_paths_v2 dp
                ON dp.volume_id = n.volume_id AND dp.file_reference = n.file_reference
            LEFT JOIN catalog_directory_paths_v2 pp
                ON pp.volume_id = n.volume_id AND pp.file_reference = n.parent_file_reference
            """);
        sql.Append(" ORDER BY ").Append(CatalogQueryOrdering.Order(query, "m")).Append(';');
        command.CommandText = sql.ToString();
        var items = new List<CatalogV2QueryItem>(query.PageSize + 1);
        await using var reader = await command.ExecuteReaderAsync(token);
        while (await reader.ReadAsync(token))
        {
            items.Add(new CatalogV2QueryItem(
                new CatalogEntryIdentity(reader.GetString(0), reader.GetString(1)),
                reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetInt32(5) != 0,
                reader.GetInt64(6), reader.IsDBNull(7) ? null : reader.GetInt64(7),
                reader.IsDBNull(8) ? null : reader.GetInt64(8),
                reader.IsDBNull(9) ? null : reader.GetInt64(9)));
        }
        CatalogQueryCursorKey? next = null;
        if (items.Count > query.PageSize)
        {
            items.RemoveAt(items.Count - 1);
            var last = items[^1];
            next = new CatalogQueryCursorKey(last.Name, last.Identity.VolumeId, last.Identity.FileReference, last.ModifiedUtcTicks ?? -1, last.IsDirectory, query.RandomSeed is { } seed ? Queries.CatalogRandomOrdering.Score(last.Identity.VolumeId, last.Identity.FileReference, seed) : null);
        }
        return new CatalogV2QueryPage(items, next, revision, factRevision);
    }

    public Task<CatalogV2QueryPage> GetChildrenAsync(
        CatalogEntryIdentity directory,
        int pageSize,
        CatalogQueryCursorKey? after = null,
        CancellationToken token = default) => QueryAsync(new CatalogV2Query(
            string.Empty,
            [directory.VolumeId],
            CatalogQueryScope.DirectChildren(directory.VolumeId, directory.FileReference),
            null,
            CatalogEntryType.Any,
            pageSize,
            after), token);

    public async Task<CatalogResolvedDirectory?> ResolveDirectoryAsync(
        string volumeId,
        string relativePath,
        CancellationToken token = default)
    {
        RequireText(volumeId, 64, nameof(volumeId));
        ArgumentNullException.ThrowIfNull(relativePath);
        if (relativePath.Length > 32767) throw new ArgumentOutOfRangeException(nameof(relativePath));
        await using var connection = await OpenAsync(true, token);
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT p.file_reference, p.relative_path
            FROM catalog_directory_paths_v2 p
            JOIN catalog_nodes_v2 n
              ON n.volume_id = p.volume_id AND n.file_reference = p.file_reference
            WHERE p.volume_id = $volume AND p.relative_path = $path COLLATE NOCASE
              AND n.exists_flag = 1 AND n.is_directory = 1
            LIMIT 1;
            """;
        command.Parameters.AddWithValue("$volume", volumeId);
        command.Parameters.AddWithValue("$path", relativePath);
        await using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token)
            ? new CatalogResolvedDirectory(
                new CatalogEntryIdentity(volumeId, reader.GetString(0)),
                reader.GetString(1))
            : null;
    }

    public static string EncodeFileReference(ulong value) => value.ToString("X16");

    internal static async Task UpsertNodesAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string tableName,
        IReadOnlyList<CatalogV2NodeRecord> nodes,
        CancellationToken token)
    {
        if (tableName is not ("catalog_nodes_v2" or "build_nodes"))
        {
            throw new ArgumentOutOfRangeException(nameof(tableName));
        }
        if (nodes.Count == 0) return;
        var commands = new Dictionary<int, SqliteCommand>();
        try
        {
            for (var offset = 0; offset < nodes.Count; offset += NodeWriteChunkSize)
            {
                var count = Math.Min(NodeWriteChunkSize, nodes.Count - offset);
                if (!commands.TryGetValue(count, out var command))
                {
                    command = CreateNodeUpsertCommand(connection, transaction, tableName, count);
                    commands.Add(count, command);
                }
                BindNodeUpsertCommand(command, nodes, offset, count);
                await command.ExecuteNonQueryAsync(token);
            }
        }
        finally
        {
            foreach (var command in commands.Values) command.Dispose();
        }
    }

    private static SqliteCommand CreateNodeUpsertCommand(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string tableName,
        int count)
    {
        var command = connection.CreateCommand();
        command.Transaction = transaction;
        var sql = new StringBuilder($$"""
            INSERT INTO {{tableName}}(
                volume_id, file_reference, parent_file_reference, name, extension,
                is_directory, attributes, exists_flag, size_bytes, created_utc_ticks, modified_utc_ticks)
            VALUES
            """);
        command.Parameters.Add("$volume", SqliteType.Text);
        for (var index = 0; index < count; index++)
        {
            if (index > 0) sql.Append(',');
            sql.Append($"($volume, $reference{index}, $parent{index}, $name{index}, $extension{index}, ");
            sql.Append($"$directory{index}, $attributes{index}, $exists{index}, $size{index}, $created{index}, $modified{index})");
            command.Parameters.Add($"$reference{index}", SqliteType.Text);
            command.Parameters.Add($"$parent{index}", SqliteType.Text);
            command.Parameters.Add($"$name{index}", SqliteType.Text);
            command.Parameters.Add($"$extension{index}", SqliteType.Text);
            command.Parameters.Add($"$directory{index}", SqliteType.Integer);
            command.Parameters.Add($"$attributes{index}", SqliteType.Integer);
            command.Parameters.Add($"$exists{index}", SqliteType.Integer);
            command.Parameters.Add($"$size{index}", SqliteType.Integer);
            command.Parameters.Add($"$created{index}", SqliteType.Integer);
            command.Parameters.Add($"$modified{index}", SqliteType.Integer);
        }
        sql.Append($$"""
            ON CONFLICT(volume_id, file_reference) DO UPDATE SET
                parent_file_reference = CASE WHEN excluded.exists_flag = 1 THEN excluded.parent_file_reference ELSE {{tableName}}.parent_file_reference END,
                name = CASE WHEN excluded.exists_flag = 1 THEN excluded.name ELSE {{tableName}}.name END,
                extension = CASE WHEN excluded.exists_flag = 1 THEN excluded.extension ELSE {{tableName}}.extension END,
                is_directory = CASE WHEN excluded.exists_flag = 1 THEN excluded.is_directory ELSE {{tableName}}.is_directory END,
                attributes = CASE WHEN excluded.exists_flag = 1 THEN excluded.attributes ELSE {{tableName}}.attributes END,
                exists_flag = excluded.exists_flag,
                size_bytes = CASE WHEN excluded.exists_flag = 1 THEN excluded.size_bytes ELSE {{tableName}}.size_bytes END,
                created_utc_ticks = CASE WHEN excluded.exists_flag = 1 THEN excluded.created_utc_ticks ELSE {{tableName}}.created_utc_ticks END,
                modified_utc_ticks = CASE WHEN excluded.exists_flag = 1 THEN excluded.modified_utc_ticks ELSE {{tableName}}.modified_utc_ticks END;
            """);
        command.CommandText = sql.ToString();
        command.Prepare();
        return command;
    }

    private static void BindNodeUpsertCommand(
        SqliteCommand command,
        IReadOnlyList<CatalogV2NodeRecord> nodes,
        int offset,
        int count)
    {
        command.Parameters[0].Value = nodes[offset].Identity.VolumeId;
        for (var index = 0; index < count; index++)
        {
            var node = nodes[offset + index];
            var parameter = 1 + index * 10;
            command.Parameters[parameter++].Value = node.Identity.FileReference;
            command.Parameters[parameter++].Value = (object?)node.ParentFileReference ?? DBNull.Value;
            command.Parameters[parameter++].Value = node.Name;
            command.Parameters[parameter++].Value = node.Extension;
            command.Parameters[parameter++].Value = node.IsDirectory ? 1 : 0;
            command.Parameters[parameter++].Value = node.Attributes;
            command.Parameters[parameter++].Value = node.Exists ? 1 : 0;
            command.Parameters[parameter++].Value = (object?)node.SizeBytes ?? DBNull.Value;
            command.Parameters[parameter++].Value = (object?)node.CreatedUtcTicks ?? DBNull.Value;
            command.Parameters[parameter].Value = (object?)node.ModifiedUtcTicks ?? DBNull.Value;
        }
    }

    private static async Task RebuildDirectoryPathsAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string volumeId,
        CancellationToken token)
    {
        var directories = new Dictionary<string, CatalogV2DirectorySeed>(StringComparer.Ordinal);
        using (var read = connection.CreateCommand())
        {
            read.Transaction = transaction;
            read.CommandText = """
                SELECT file_reference, parent_file_reference, name
                FROM catalog_nodes_v2
                WHERE volume_id = $volume AND exists_flag = 1 AND is_directory = 1;
                """;
            read.Parameters.AddWithValue("$volume", volumeId);
            await using var reader = await read.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token))
            {
                var fileReference = reader.GetString(0);
                directories[fileReference] = new CatalogV2DirectorySeed(
                    fileReference,
                    reader.IsDBNull(1) ? null : reader.GetString(1),
                    reader.GetString(2));
            }
        }

        using (var delete = connection.CreateCommand())
        {
            delete.Transaction = transaction;
            delete.CommandText = "DELETE FROM catalog_directory_paths_v2 WHERE volume_id = $volume;";
            delete.Parameters.AddWithValue("$volume", volumeId);
            await delete.ExecuteNonQueryAsync(token);
        }
        await InsertDirectoryPathsAsync(
            connection,
            transaction,
            "catalog_directory_paths_v2",
            volumeId,
            ResolveDirectoryPaths(directories),
            token);
    }

    internal static IReadOnlyDictionary<string, string> ResolveDirectoryPaths(
        IReadOnlyDictionary<string, CatalogV2DirectorySeed> directories)
    {
        ArgumentNullException.ThrowIfNull(directories);
        var resolved = new Dictionary<string, string>(directories.Count, StringComparer.Ordinal);
        foreach (var fileReference in directories.Keys.Order(StringComparer.Ordinal))
        {
            if (resolved.ContainsKey(fileReference)) continue;
            var chain = new List<string>();
            var visited = new HashSet<string>(StringComparer.Ordinal);
            var current = fileReference;
            while (!resolved.ContainsKey(current) && directories.TryGetValue(current, out var seed))
            {
                if (!visited.Add(current) || chain.Count >= 1024)
                {
                    resolved[current] = NormalizeRootDirectoryName(seed.Name);
                    break;
                }
                chain.Add(current);
                if (seed.ParentFileReference is null
                    || string.Equals(seed.ParentFileReference, current, StringComparison.Ordinal)
                    || !directories.ContainsKey(seed.ParentFileReference))
                {
                    resolved[current] = NormalizeRootDirectoryName(seed.Name);
                    break;
                }
                current = seed.ParentFileReference;
            }

            for (var index = chain.Count - 1; index >= 0; index--)
            {
                var childReference = chain[index];
                if (resolved.ContainsKey(childReference)) continue;
                var child = directories[childReference];
                var parentPath = child.ParentFileReference is not null
                    && resolved.TryGetValue(child.ParentFileReference, out var knownParent)
                        ? knownParent
                        : string.Empty;
                var path = string.IsNullOrEmpty(parentPath)
                    ? NormalizeRootDirectoryName(child.Name)
                    : parentPath + "\\" + child.Name;
                if (path.Length > 32767)
                {
                    throw new CatalogSchemaException("Catalog v2 directory path exceeds the Windows path limit.");
                }
                resolved[childReference] = path;
            }
        }
        return resolved;
    }

    internal static async Task InsertDirectoryPathsAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        string tableName,
        string volumeId,
        IReadOnlyDictionary<string, string> paths,
        CancellationToken token)
    {
        if (tableName is not ("catalog_directory_paths_v2" or "build_paths"))
        {
            throw new ArgumentOutOfRangeException(nameof(tableName));
        }
        const int chunkSize = 128;
        var ordered = paths.OrderBy(entry => entry.Key, StringComparer.Ordinal).ToArray();
        for (var offset = 0; offset < ordered.Length; offset += chunkSize)
        {
            var count = Math.Min(chunkSize, ordered.Length - offset);
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            var sql = new StringBuilder($$"""
                INSERT INTO {{tableName}}(volume_id, file_reference, relative_path) VALUES
                """);
            command.Parameters.Add("$volume", SqliteType.Text).Value = volumeId;
            for (var index = 0; index < count; index++)
            {
                if (index > 0) sql.Append(',');
                sql.Append($"($volume, $reference{index}, $path{index})");
                command.Parameters.Add($"$reference{index}", SqliteType.Text).Value = ordered[offset + index].Key;
                command.Parameters.Add($"$path{index}", SqliteType.Text).Value = ordered[offset + index].Value;
            }
            command.CommandText = sql.ToString();
            command.Prepare();
            await command.ExecuteNonQueryAsync(token);
        }
    }

    internal static void DeleteSnapshotBuildFiles(string snapshotPath)
    {
        File.Delete(snapshotPath);
        File.Delete(snapshotPath + "-wal");
        File.Delete(snapshotPath + "-shm");
    }

    private static void CleanupAbandonedSnapshotBuilds(string directory, string catalogFileName)
    {
        var prefix = catalogFileName + ".snapshot-";
        foreach (var path in Directory.EnumerateFiles(
            directory,
            prefix + "*.db",
            SearchOption.TopDirectoryOnly))
        {
            var name = Path.GetFileName(path);
            var id = name.Length > prefix.Length + 3
                ? name[prefix.Length..^3]
                : string.Empty;
            if (Guid.TryParseExact(id, "N", out _))
            {
                DeleteSnapshotBuildFiles(path);
            }
        }
    }

    private static string NormalizeRootDirectoryName(string name) => name == "." ? string.Empty : name;

    private static void AppendScopeSql(
        StringBuilder sql,
        SqliteCommand command,
        CatalogQueryScope scope)
    {
        switch (scope.Kind)
        {
            case CatalogQueryScopeKind.AllVolumes:
                sql.Append("SELECT NULL, NULL WHERE 0");
                break;
            case CatalogQueryScopeKind.DirectChildren:
                sql.Append("""
                    SELECT volume_id, file_reference FROM catalog_nodes_v2
                    WHERE volume_id = $scopeVolume AND parent_file_reference = $scopeRoot
                      AND file_reference <> $scopeRoot AND exists_flag = 1
                    """);
                command.Parameters.AddWithValue("$scopeVolume", scope.VolumeId!);
                command.Parameters.AddWithValue("$scopeRoot", scope.RootFileReference!);
                break;
            case CatalogQueryScopeKind.DirectoryDescendants:
                sql.Append("""
                    SELECT volume_id, file_reference FROM catalog_nodes_v2
                    WHERE volume_id = $scopeVolume AND parent_file_reference = $scopeRoot
                      AND file_reference <> $scopeRoot AND exists_flag = 1
                    UNION ALL
                    SELECT child.volume_id, child.file_reference
                    FROM catalog_nodes_v2 child JOIN scope_nodes parent
                      ON child.volume_id = parent.volume_id AND child.parent_file_reference = parent.file_reference
                    WHERE child.exists_flag = 1
                    """);
                command.Parameters.AddWithValue("$scopeVolume", scope.VolumeId!);
                command.Parameters.AddWithValue("$scopeRoot", scope.RootFileReference!);
                break;
            case CatalogQueryScopeKind.SavedScope:
                sql.Append("""
                    SELECT child.volume_id, child.file_reference
                    FROM catalog_nodes_v2 child JOIN catalog_saved_scopes_v2 saved
                      ON saved.scope_id = $scopeId AND child.volume_id = saved.volume_id
                     AND child.parent_file_reference = saved.root_file_reference
                    WHERE child.exists_flag = 1 AND child.file_reference <> saved.root_file_reference
                    UNION ALL
                    SELECT child.volume_id, child.file_reference
                    FROM catalog_nodes_v2 child JOIN scope_nodes parent
                      ON child.volume_id = parent.volume_id AND child.parent_file_reference = parent.file_reference
                    WHERE child.exists_flag = 1
                    """);
                command.Parameters.AddWithValue("$scopeId", scope.SavedScopeId!);
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(scope));
        }
    }

    private async Task<CatalogV2VolumeSnapshot> ChangeStateAsync(
        string volumeId,
        CatalogV2VolumeState expected,
        CatalogV2VolumeState next,
        CancellationToken token)
    {
        if (!CanTransition(expected, next))
        {
            throw new CatalogStateTransitionException($"Catalog v2 cannot transition from {expected} to {next}.");
        }
        await using var connection = await OpenAsync(false, token);
        using var transaction = connection.BeginTransaction();
        var revision = NextRevision(await ReadRevisionAsync(connection, transaction, token));
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            UPDATE catalog_volumes_v2 SET state = $next, catalog_revision = $revision
            WHERE volume_id = $volume AND state = $expected;
            """;
        command.Parameters.AddWithValue("$next", ToStorage(next));
        command.Parameters.AddWithValue("$revision", revision);
        command.Parameters.AddWithValue("$volume", volumeId);
        command.Parameters.AddWithValue("$expected", ToStorage(expected));
        if (await command.ExecuteNonQueryAsync(token) != 1)
        {
            throw new CatalogConcurrencyException("Catalog v2 volume state changed before commit.");
        }
        if (next == CatalogV2VolumeState.NeedsRebuild)
            await FileFacts.FileFactCatalogInvalidation.ApplyVolumeAsync(connection, transaction, volumeId, token);
        await SetRevisionAsync(connection, transaction, revision, token);
        transaction.Commit();
        return (await ReadVolumeAsync(volumeId, token))!;
    }

    private static bool CanTransition(CatalogV2VolumeState from, CatalogV2VolumeState to) => (from, to) switch
    {
        (CatalogV2VolumeState.Ready, CatalogV2VolumeState.CatchingUp or CatalogV2VolumeState.Offline or CatalogV2VolumeState.NeedsRebuild) => true,
        (CatalogV2VolumeState.CatchingUp, CatalogV2VolumeState.Ready or CatalogV2VolumeState.Offline or CatalogV2VolumeState.NeedsRebuild) => true,
        (CatalogV2VolumeState.Offline, CatalogV2VolumeState.CatchingUp or CatalogV2VolumeState.NeedsRebuild) => true,
        (CatalogV2VolumeState.Disabled, CatalogV2VolumeState.Offline) => true,
        (CatalogV2VolumeState.Building, CatalogV2VolumeState.NeedsRebuild) => true,
        _ => false
    };

    private static string ToStorage(CatalogV2VolumeState state) => state switch
    {
        CatalogV2VolumeState.Disabled => "disabled",
        CatalogV2VolumeState.Building => "building",
        CatalogV2VolumeState.Ready => "ready",
        CatalogV2VolumeState.CatchingUp => "catchingUp",
        CatalogV2VolumeState.Offline => "offline",
        CatalogV2VolumeState.NeedsRebuild => "needsRebuild",
        _ => throw new ArgumentOutOfRangeException(nameof(state))
    };

    private static CatalogV2VolumeState FromStorage(string value) => value switch
    {
        "disabled" => CatalogV2VolumeState.Disabled,
        "building" => CatalogV2VolumeState.Building,
        "ready" => CatalogV2VolumeState.Ready,
        "catchingUp" => CatalogV2VolumeState.CatchingUp,
        "offline" => CatalogV2VolumeState.Offline,
        "needsRebuild" => CatalogV2VolumeState.NeedsRebuild,
        _ => throw new CatalogSchemaException("Catalog v2 contains an unknown volume state.")
    };

    private static CatalogV2VolumeSnapshot ReadVolume(SqliteDataReader reader) => new(
        reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetInt32(3) != 0,
        reader.IsDBNull(4) ? null : reader.GetString(4), reader.IsDBNull(5) ? null : reader.GetInt64(5),
        reader.IsDBNull(6) ? null : reader.GetInt64(6), reader.IsDBNull(7) ? null : reader.GetInt64(7),
        FromStorage(reader.GetString(8)), reader.GetInt64(9), reader.IsDBNull(10) ? null : reader.GetInt64(10),
        reader.GetInt64(11));

    private static async Task<CatalogV2VolumeSnapshot?> ReadVolumeAsync(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string volumeId,
        CancellationToken token)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT volume_id, display_name, file_system, selected, journal_id, checkpoint_usn,
                   journal_first_usn, journal_lowest_valid_usn, state, processed, total, catalog_revision
            FROM catalog_volumes_v2 WHERE volume_id = $volume;
            """;
        command.Parameters.AddWithValue("$volume", volumeId);
        await using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token) ? ReadVolume(reader) : null;
    }

    internal async Task<SqliteConnection> OpenAsync(bool readOnly, CancellationToken token)
    {
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Private,
            Pooling = true
        }.ToString());
        await connection.OpenAsync(token);
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL; PRAGMA trusted_schema = OFF;";
        await command.ExecuteNonQueryAsync(token);
        return connection;
    }

    private static async Task<long> ReadRevisionAsync(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        CancellationToken token)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT catalog_revision FROM catalog_state_v2 WHERE singleton = 1;";
        return Convert.ToInt64(await command.ExecuteScalarAsync(token));
    }

    private static async Task SetRevisionAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        long revision,
        CancellationToken token)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "UPDATE catalog_state_v2 SET catalog_revision = $revision WHERE singleton = 1;";
        command.Parameters.AddWithValue("$revision", revision);
        if (await command.ExecuteNonQueryAsync(token) != 1)
        {
            throw new CatalogSchemaException("Catalog v2 state is missing.");
        }
    }

    private static async Task<bool> CheckIntegrityAsync(SqliteConnection connection, CancellationToken token)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA quick_check;";
        return string.Equals(Convert.ToString(await command.ExecuteScalarAsync(token)), "ok", StringComparison.Ordinal);
    }

    private static long NextRevision(long revision) => checked(revision + 1);

    private static void ValidateBatch(CatalogV2WriteBatch batch)
    {
        ArgumentNullException.ThrowIfNull(batch);
        RequireText(batch.VolumeId, 64, nameof(batch.VolumeId));
        if (batch.ExpectedJournalId is not null) RequireText(batch.ExpectedJournalId, 32, nameof(batch.ExpectedJournalId));
        if (batch.Nodes.Count > CatalogV2Contract.MaximumBatchNodes) throw new ArgumentOutOfRangeException(nameof(batch));
        RequireNonNegative(batch.NextCheckpointUsn, nameof(batch.NextCheckpointUsn));
        foreach (var node in batch.Nodes)
        {
            ValidateIdentity(node.Identity);
            if (node.SuppressFileFactChangeHint && !node.IsDirectory)
                throw new ArgumentException("Only trusted owned directory ancestry may suppress change hints.", nameof(batch));
            if (!string.Equals(node.Identity.VolumeId, batch.VolumeId, StringComparison.Ordinal))
            {
                throw new ArgumentException("Catalog v2 node belongs to another volume.", nameof(batch));
            }
            if (node.ParentFileReference is not null) RequireReference(node.ParentFileReference, nameof(node.ParentFileReference));
            RequireText(node.Name, 1024, nameof(node.Name));
            if (node.Extension.Length > 64 || node.Attributes < 0 || node.SizeBytes < 0
                || node.CreatedUtcTicks < 0 || node.ModifiedUtcTicks < 0)
            {
                throw new ArgumentException("Catalog v2 node facts are invalid.", nameof(batch));
            }
        }
    }

    internal static void ValidateSnapshotNodes(
        string volumeId,
        IReadOnlyList<CatalogV2NodeRecord> nodes)
    {
        RequireText(volumeId, 64, nameof(volumeId));
        ArgumentNullException.ThrowIfNull(nodes);
        if (nodes.Count > CatalogV2Contract.MaximumBatchNodes)
        {
            throw new ArgumentOutOfRangeException(nameof(nodes));
        }
        foreach (var node in nodes)
        {
            ArgumentNullException.ThrowIfNull(node);
            ValidateIdentity(node.Identity);
            if (!string.Equals(node.Identity.VolumeId, volumeId, StringComparison.Ordinal))
            {
                throw new ArgumentException("Catalog v2 snapshot node belongs to another volume.", nameof(nodes));
            }
            if (node.ParentFileReference is not null)
            {
                RequireReference(node.ParentFileReference, nameof(node.ParentFileReference));
            }
            RequireText(node.Name, 1024, nameof(node.Name));
            if (!node.Exists || node.Extension.Length > 64 || node.Attributes < 0 || node.SizeBytes < 0
                || node.CreatedUtcTicks < 0 || node.ModifiedUtcTicks < 0)
            {
                throw new ArgumentException("Catalog v2 snapshot node facts are invalid.", nameof(nodes));
            }
        }
    }

    private static void ValidateQuery(CatalogV2Query query)
    {
        ArgumentNullException.ThrowIfNull(query);
        ArgumentNullException.ThrowIfNull(query.Scope);
        if (query.FileConditions is not null) CatalogFileConditionSql.Validate(query.FileConditions);
        if (!Enum.IsDefined(query.Sort) || !Enum.IsDefined(query.TextTarget) || query.Query.Length > 512 || query.PageSize is < 1 or > CatalogV2Contract.MaximumPageSize
            || query.VolumeIds.Count > 32
            || query.Query.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Length > CatalogV2Contract.MaximumQueryTerms)
        {
            throw new ArgumentException("Catalog v2 query is outside contract limits.", nameof(query));
        }
        foreach (var id in query.VolumeIds) RequireText(id, 64, nameof(query.VolumeIds));
        if (query.Extension is { Length: > 64 }) throw new ArgumentException("Extension is too long.", nameof(query));
        if (query.Scope.Kind is CatalogQueryScopeKind.DirectoryDescendants or CatalogQueryScopeKind.DirectChildren)
        {
            RequireText(query.Scope.VolumeId ?? string.Empty, 64, nameof(query.Scope));
            RequireReference(query.Scope.RootFileReference ?? string.Empty, nameof(query.Scope));
        }
        if (query.Scope.Kind == CatalogQueryScopeKind.SavedScope)
        {
            RequireText(query.Scope.SavedScopeId ?? string.Empty, 128, nameof(query.Scope));
        }
    }

    internal static void ValidateIdentity(CatalogEntryIdentity identity)
    {
        ArgumentNullException.ThrowIfNull(identity);
        RequireText(identity.VolumeId, 64, nameof(identity.VolumeId));
        RequireReference(identity.FileReference, nameof(identity.FileReference));
    }

    private static void RequireReference(string value, string parameterName)
    {
        if (value.Length != 16 || !value.All(character => char.IsAsciiHexDigit(character)))
        {
            throw new ArgumentException("File reference must be 16 hexadecimal characters.", parameterName);
        }
    }

    private static void RequireText(string value, int maximum, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > maximum)
        {
            throw new ArgumentException($"{parameterName} is outside text limits.", parameterName);
        }
    }

    private static void RequireNonNegative(long value, string parameterName)
    {
        if (value < 0) throw new ArgumentOutOfRangeException(parameterName);
    }

    private static string EscapeLike(string value) => value
        .Replace("\\", "\\\\", StringComparison.Ordinal)
        .Replace("%", "\\%", StringComparison.Ordinal)
        .Replace("_", "\\_", StringComparison.Ordinal);
}

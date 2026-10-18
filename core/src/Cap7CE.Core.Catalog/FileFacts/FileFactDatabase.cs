using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

// Opt-in library over an existing Catalog v2. No source-file access or automatic host activation.
public sealed class FileFactDatabase(string databasePath)
{
    public async Task InitializeAsync(CancellationToken token = default)
    {
        await using var connection = await OpenAsync(false, token);
        await FileFactSchema.InitializeAsync(connection, token);
    }

    public async Task<long> ReadRevisionAsync(CancellationToken token = default)
    {
        await using var connection = await OpenAsync(true, token);
        await FileFactSchema.ValidateAsync(connection, token);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT fact_revision FROM file_fact_state WHERE singleton = 1;";
        return Convert.ToInt64(await command.ExecuteScalarAsync(token));
    }

    public async Task<FileFactSourceVersion?> CaptureAsync(
        CatalogEntryIdentity identity, CancellationToken token = default)
    {
        ValidateIdentity(identity);
        await using var connection = await OpenAsync(true, token);
        await FileFactSchema.ValidateAsync(connection, token);
        return await CaptureAsync(connection, null, identity, token);
    }

    public async Task<FileFactPublishResult> PublishAsync(
        FileFactObservation observation, CancellationToken token = default)
    {
        ValidateObservation(observation);
        await using var connection = await OpenAsync(false, token);
        await FileFactSchema.ValidateAsync(connection, token);
        // Immediate transaction prevents a base Catalog update between check and publication.
        using var transaction = connection.BeginTransaction(deferred: false);
        var result = await PublishAsync(connection, transaction, observation, token);
        transaction.Commit();
        return result;
    }

    internal static async Task<FileFactPublishResult> PublishAsync(SqliteConnection connection,
        SqliteTransaction transaction, FileFactObservation observation, CancellationToken token)
    {
        ValidateObservation(observation);
        var current = await CaptureAsync(connection, transaction, observation.Identity, token);
        if (current != observation.Source) return FileFactPublishResult.SourceChanged;
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO file_facts VALUES(
                $volume, $reference, $kind, $extractor, $state, $size, $modified,
                $epoch, $revision, $width, $height, $duration, $error)
            ON CONFLICT(volume_id, file_reference, kind) DO UPDATE SET
                extractor_version = excluded.extractor_version, state = excluded.state,
                size_bytes = excluded.size_bytes, modified_file_time = excluded.modified_file_time,
                volume_epoch = excluded.volume_epoch, content_revision = excluded.content_revision,
                width = excluded.width, height = excluded.height, duration_ms = excluded.duration_ms,
                error_code = excluded.error_code
            WHERE file_facts.extractor_version <= excluded.extractor_version;
            """;
        BindIdentity(command, observation.Identity);
        command.Parameters.AddWithValue("$kind", (int)observation.Kind);
        command.Parameters.AddWithValue("$extractor", observation.ExtractorVersion);
        command.Parameters.AddWithValue("$state", (int)observation.State);
        command.Parameters.AddWithValue("$size", observation.Source.SizeBytes);
        command.Parameters.AddWithValue("$modified", observation.Source.ModifiedFileTime);
        command.Parameters.AddWithValue("$epoch", observation.Source.VolumeEpoch);
        command.Parameters.AddWithValue("$revision", observation.Source.ContentRevision);
        command.Parameters.AddWithValue("$width", (object?)observation.Width ?? DBNull.Value);
        command.Parameters.AddWithValue("$height", (object?)observation.Height ?? DBNull.Value);
        command.Parameters.AddWithValue("$duration", (object?)observation.DurationMilliseconds ?? DBNull.Value);
        command.Parameters.AddWithValue("$error", (object?)observation.ErrorCode ?? DBNull.Value);
        if (await command.ExecuteNonQueryAsync(token) == 0) return FileFactPublishResult.ExtractorSuperseded;
        await FileFactImageDetails.PublishAsync(connection, transaction, observation, token);
        await FileFactAudioDetails.PublishAsync(connection, transaction, observation, token);
        await FileFactFontDetails.PublishAsync(connection, transaction, observation, token);
        await FileFactModelDetails.PublishAsync(connection, transaction, observation, token);
        await FileFactDocumentDetails.PublishAsync(connection, transaction, observation, token);
        await FileFactThreeDDetails.PublishAsync(connection, transaction, observation, token);
        await FileFactTextDataDetails.PublishAsync(connection, transaction, observation, token);
        await FileFactArchiveDetails.PublishAsync(connection, transaction, observation, token);
        command.CommandText = "UPDATE file_fact_state SET fact_revision = fact_revision + 1 WHERE singleton = 1;";
        await command.ExecuteNonQueryAsync(token);
        return FileFactPublishResult.Published;
    }

    public async Task<FileFactObservation?> ReadCurrentAsync(
        CatalogEntryIdentity identity, FileFactKind kind, int extractorVersion,
        CancellationToken token = default)
    {
        ValidateIdentity(identity);
        if (!Enum.IsDefined(kind) || extractorVersion <= 0) throw new ArgumentOutOfRangeException(nameof(kind));
        await using var connection = await OpenAsync(true, token);
        await FileFactSchema.ValidateAsync(connection, token);
        // One read snapshot covers both the source fence and cached fact.
        using var transaction = connection.BeginTransaction(deferred: true);
        var source = await CaptureAsync(connection, transaction, identity, token);
        if (source is null) return null;
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT state, width, height, duration_ms, error_code FROM file_facts
            WHERE volume_id = $volume AND file_reference = $reference AND kind = $kind
                AND extractor_version = $extractor AND size_bytes = $size
                AND modified_file_time = $modified AND volume_epoch = $epoch
                AND content_revision = $revision;
            """;
        BindIdentity(command, identity);
        command.Parameters.AddWithValue("$kind", (int)kind);
        command.Parameters.AddWithValue("$extractor", extractorVersion);
        command.Parameters.AddWithValue("$size", source.SizeBytes);
        command.Parameters.AddWithValue("$modified", source.ModifiedFileTime);
        command.Parameters.AddWithValue("$epoch", source.VolumeEpoch);
        command.Parameters.AddWithValue("$revision", source.ContentRevision);
        using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token)) return null;
        var observation = new FileFactObservation(identity, source, kind, extractorVersion, (FileFactState)reader.GetInt32(0),
            reader.IsDBNull(1) ? null : reader.GetInt32(1),
            reader.IsDBNull(2) ? null : reader.GetInt32(2),
            reader.IsDBNull(3) ? null : reader.GetInt64(3),
            reader.IsDBNull(4) ? null : reader.GetString(4));
        await reader.DisposeAsync();
        if (kind == FileFactKind.Archive) return observation with {
            ArchiveProperties = await FileFactArchiveDetails.ReadAsync(connection, transaction, identity, token) };
        if (kind == FileFactKind.TextData) return observation with {
            TextDataProperties = await FileFactTextDataDetails.ReadAsync(connection, transaction, identity, token) };
        if (kind == FileFactKind.ThreeD) return observation with {
            ThreeDProperties = await FileFactThreeDDetails.ReadAsync(connection, transaction, identity, token) };
        if (kind == FileFactKind.Document) return observation with {
            DocumentProperties = await FileFactDocumentDetails.ReadAsync(connection, transaction, identity, token) };
        if (kind == FileFactKind.Model) return observation with {
            ModelProperties = await FileFactModelDetails.ReadAsync(connection, transaction, identity, token) };
        if (kind == FileFactKind.Font) return observation with {
            FontProperties = await FileFactFontDetails.ReadAsync(connection, transaction, identity, token) };
        if (kind == FileFactKind.Audio) return observation with {
            ChannelCount = await FileFactAudioDetails.ReadAsync(connection, transaction, identity, token) };
        if (kind is not (FileFactKind.ImageDimensions or FileFactKind.Video)) return observation;
        var details = await FileFactImageDetails.ReadAsync(connection, transaction, identity, kind, token);
        return observation with { IsAnimated = details.IsAnimated, VisualProperties = details.Properties };
    }

    // Explicit fences for changes outside the Catalog synchronization path.
    // Catalog batches/rebuilds apply equivalent fences in their own transaction.
    public async Task InvalidateContentAsync(CatalogEntryIdentity identity, CancellationToken token = default)
    {
        ValidateIdentity(identity);
        await InvalidateAsync(identity, false, token);
    }

    public async Task InvalidateVolumeAsync(string volumeId, CancellationToken token = default)
    {
        ValidateVolume(volumeId);
        await InvalidateAsync(new(volumeId, "0000000000000000"), true, token);
    }

    private async Task InvalidateAsync(CatalogEntryIdentity identity, bool volume, CancellationToken token)
    {
        await using var connection = await OpenAsync(false, token);
        await FileFactSchema.ValidateAsync(connection, token);
        using var transaction = connection.BeginTransaction(deferred: false);
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = volume ? """
            INSERT INTO file_fact_volumes VALUES($volume, 1)
            ON CONFLICT(volume_id) DO UPDATE SET epoch = epoch + 1;
            """ : """
            INSERT INTO file_fact_sources VALUES($volume, $reference, 1)
            ON CONFLICT(volume_id, file_reference) DO UPDATE SET content_revision = content_revision + 1;
            """;
        BindIdentity(command, identity);
        await command.ExecuteNonQueryAsync(token);
        command.CommandText = "UPDATE file_fact_state SET fact_revision = fact_revision + 1 WHERE singleton = 1;";
        await command.ExecuteNonQueryAsync(token);
        transaction.Commit();
    }

    internal static async Task<FileFactSourceVersion?> CaptureAsync(SqliteConnection connection,
        SqliteTransaction? transaction, CatalogEntryIdentity identity, CancellationToken token)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        var pending = await DirectoryEntries.CatalogFileEntryPending.ExclusionSqlAsync(connection, transaction, token);
        command.CommandText = $"""
            SELECT n.size_bytes, n.modified_utc_ticks, COALESCE(v.epoch, 0), COALESCE(s.content_revision, 0)
            FROM catalog_nodes_v2 n
            JOIN catalog_volumes_v2 c ON c.volume_id = n.volume_id
            LEFT JOIN file_fact_volumes v ON v.volume_id = n.volume_id
            LEFT JOIN file_fact_sources s ON s.volume_id = n.volume_id AND s.file_reference = n.file_reference
            WHERE n.volume_id = $volume AND n.file_reference = $reference
                AND n.exists_flag = 1 AND n.is_directory = 0
                AND (n.attributes & 0x00441400) = 0
                AND n.size_bytes IS NOT NULL AND n.modified_utc_ticks IS NOT NULL
                AND c.state = 'ready' AND c.selected = 1 AND {pending};
            """;
        BindIdentity(command, identity);
        using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token)
            ? new(reader.GetInt64(0), reader.GetInt64(1), reader.GetInt64(2), reader.GetInt64(3)) : null;
    }

    internal async Task<SqliteConnection> OpenAsync(bool readOnly, CancellationToken token)
    {
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = databasePath, Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWrite,
            Pooling = false
        }.ToString());
        try
        {
            await connection.OpenAsync(token);
            using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL; PRAGMA trusted_schema = OFF;";
            await command.ExecuteNonQueryAsync(token);
            return connection;
        }
        catch { await connection.DisposeAsync(); throw; }
    }

    internal static void BindIdentity(SqliteCommand command, CatalogEntryIdentity identity)
    {
        command.Parameters.AddWithValue("$volume", identity.VolumeId);
        command.Parameters.AddWithValue("$reference", identity.FileReference.ToUpperInvariant());
    }

    private static void ValidateVolume(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 64) throw new ArgumentException("Invalid volume identity.");
    }

    internal static void ValidateIdentity(CatalogEntryIdentity identity)
    {
        ArgumentNullException.ThrowIfNull(identity);
        ValidateVolume(identity.VolumeId);
        if (identity.FileReference is null || identity.FileReference.Length != 16
            || !identity.FileReference.All(char.IsAsciiHexDigit)) throw new ArgumentException("Invalid file reference.");
    }

    private static void ValidateObservation(FileFactObservation observation)
    {
        ArgumentNullException.ThrowIfNull(observation);
        ValidateIdentity(observation.Identity);
        ArgumentNullException.ThrowIfNull(observation.Source);
        FileFactImageMetrics.Validate(observation.VisualProperties);
        FileFactFontDetails.Validate(observation);
        FileFactModelDetails.Validate(observation);
        FileFactDocumentDetails.Validate(observation);
        FileFactThreeDDetails.Validate(observation);
        FileFactTextDataDetails.Validate(observation);
        FileFactArchiveDetails.Validate(observation);
        if (!Enum.IsDefined(observation.Kind) || !Enum.IsDefined(observation.State)
            || observation.ExtractorVersion <= 0 || observation.Source.SizeBytes < 0
            || observation.Source.ModifiedFileTime < 0 || observation.Source.VolumeEpoch < 0
            || observation.Source.ContentRevision < 0 || observation.Width <= 0 || observation.Height <= 0
            || observation.DurationMilliseconds < 0 || (observation.Width is null) != (observation.Height is null)
            || observation.ChannelCount <= 0
            || (observation.ChannelCount is not null && (observation.Kind != FileFactKind.Audio || observation.State != FileFactState.Indexed))
            || (observation.Kind == FileFactKind.Audio && observation.Width is not null)
            || (observation.Kind == FileFactKind.ImageDimensions && observation.DurationMilliseconds is not null)
            || (observation.IsAnimated is not null
                && (observation.Kind != FileFactKind.ImageDimensions || observation.State != FileFactState.Indexed))
            || (observation.VisualProperties is not null
                && (observation.Kind is not (FileFactKind.ImageDimensions or FileFactKind.Video) || observation.State != FileFactState.Indexed))
            || (observation.State != FileFactState.Indexed && (observation.Width is not null || observation.DurationMilliseconds is not null))
            || (observation.State == FileFactState.Indexed && observation.ErrorCode is not null)
            || (observation.State == FileFactState.Indexed && observation.Width is null && observation.DurationMilliseconds is null && observation.FontProperties is null && observation.ModelProperties is null && observation.DocumentProperties is null && observation.ThreeDProperties is null && observation.TextDataProperties is null && observation.ArchiveProperties is null)
            || (observation.ErrorCode is not null && (string.IsNullOrWhiteSpace(observation.ErrorCode) || observation.ErrorCode.Length > 128)))
            throw new ArgumentException("Invalid file fact observation.");
    }
}

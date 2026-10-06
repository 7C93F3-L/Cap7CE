using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

internal static class FileFactSchema
{
    internal const int Version = 11;
    public static async Task ValidateAsync(SqliteConnection connection, CancellationToken token)
    {
        await CatalogV2Schema.ValidateAsync(connection, token);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'file_fact_state');";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) == 0)
            throw new CatalogSchemaException("File fact store is not initialized.");
        command.CommandText = "SELECT schema_version FROM file_fact_state WHERE singleton = 1;";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != Version)
            throw new CatalogSchemaException("File fact schema version is unsupported.");
        command.CommandText = """
            SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'
                AND name IN ('file_fact_state', 'file_fact_volumes', 'file_fact_sources', 'file_facts', 'file_fact_image_details', 'file_fact_audio_details', 'file_fact_font_details', 'file_fact_model_details', 'file_fact_document_details', 'file_fact_three_d_details', 'file_fact_text_data_details', 'file_fact_archive_details', 'file_fact_catalog_changes');
            """;
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 13)
            throw new CatalogSchemaException("File fact schema is incomplete.");
    }

    public static async Task InitializeAsync(SqliteConnection connection, CancellationToken token)
    {
        await CatalogV2Schema.ValidateAsync(connection, token);
        using var exists = connection.CreateCommand();
        exists.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'file_fact_state');";
        if (Convert.ToInt32(await exists.ExecuteScalarAsync(token)) == 1)
        {
            await ValidateAsync(connection, token);
            return;
        }
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            CREATE TABLE file_fact_state (
                singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
                schema_version INTEGER NOT NULL CHECK(schema_version = 11),
                fact_revision INTEGER NOT NULL CHECK(fact_revision >= 0)
            ) STRICT;
            INSERT INTO file_fact_state VALUES(1, 11, 0);
            CREATE TABLE file_fact_volumes (
                volume_id TEXT PRIMARY KEY,
                epoch INTEGER NOT NULL CHECK(epoch >= 0)
            ) STRICT;
            CREATE TABLE file_fact_sources (
                volume_id TEXT NOT NULL,
                file_reference TEXT NOT NULL,
                content_revision INTEGER NOT NULL CHECK(content_revision >= 0),
                PRIMARY KEY(volume_id, file_reference)
            ) STRICT, WITHOUT ROWID;
            CREATE TABLE file_facts (
                volume_id TEXT NOT NULL,
                file_reference TEXT NOT NULL,
                kind INTEGER NOT NULL CHECK(kind IN (0, 1, 2, 3, 4, 5, 6, 7, 8)),
                extractor_version INTEGER NOT NULL CHECK(extractor_version > 0),
                state INTEGER NOT NULL CHECK(state BETWEEN 0 AND 3),
                size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
                modified_file_time INTEGER NOT NULL CHECK(modified_file_time >= 0),
                volume_epoch INTEGER NOT NULL CHECK(volume_epoch >= 0),
                content_revision INTEGER NOT NULL CHECK(content_revision >= 0),
                width INTEGER NULL CHECK(width BETWEEN 1 AND 2147483647),
                height INTEGER NULL CHECK(height BETWEEN 1 AND 2147483647),
                duration_ms INTEGER NULL CHECK(duration_ms >= 0),
                error_code TEXT NULL CHECK(length(error_code) BETWEEN 1 AND 128),
                CHECK((width IS NULL) = (height IS NULL)),
                CHECK(kind IN (1,2) OR duration_ms IS NULL),
                CHECK(kind <> 2 OR width IS NULL),
                CHECK(kind NOT IN (3,4,5,6,7,8) OR width IS NULL),
                CHECK(state = 0 OR (width IS NULL AND height IS NULL AND duration_ms IS NULL)),
                CHECK(state <> 0 OR error_code IS NULL),
                PRIMARY KEY(volume_id, file_reference, kind)
            ) STRICT, WITHOUT ROWID;
            CREATE INDEX file_facts_dimensions ON file_facts(kind, extractor_version, width, height,
                volume_id, file_reference, volume_epoch, content_revision)
                WHERE state = 0 AND width IS NOT NULL;
            CREATE INDEX file_facts_duration ON file_facts(kind, extractor_version, duration_ms, width, height,
                volume_id, file_reference, volume_epoch, content_revision)
                WHERE state = 0 AND duration_ms IS NOT NULL;
            """;
        command.CommandText += FileFactImageDetails.CreateTableSql();
        command.CommandText += FileFactAudioDetails.CreateTableSql;
        command.CommandText += FileFactFontDetails.CreateTableSql;
        command.CommandText += FileFactModelDetails.CreateTableSql;
        command.CommandText += FileFactDocumentDetails.CreateTableSql;
        command.CommandText += FileFactThreeDDetails.CreateTableSql;
        command.CommandText += FileFactTextDataDetails.CreateTableSql;
        command.CommandText += FileFactArchiveDetails.CreateTableSql;
        command.CommandText += FileFactChangeLog.CreateTableSql;
        await command.ExecuteNonQueryAsync(token);
        transaction.Commit();
    }
}

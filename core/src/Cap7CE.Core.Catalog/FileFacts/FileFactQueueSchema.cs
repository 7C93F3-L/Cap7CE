using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

internal static class FileFactQueueSchema
{
    public static async Task InitializeAsync(SqliteConnection connection, CancellationToken token)
    {
        await FileFactSchema.ValidateAsync(connection, token);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'file_fact_queue_state');";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) == 1)
        {
            await ValidateAsync(connection, token);
            return;
        }
        using var transaction = connection.BeginTransaction();
        command.Transaction = transaction;
        command.CommandText = """
            CREATE TABLE file_fact_queue_state (
                singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
                schema_version INTEGER NOT NULL CHECK(schema_version = 8),
                policy_epoch INTEGER NOT NULL CHECK(policy_epoch >= 0),
                policy_json TEXT NOT NULL
            ) STRICT;
            INSERT INTO file_fact_queue_state VALUES(1, 8, 0, '{"VolumeOrder":[],"Includes":[],"Excludes":[]}');
            CREATE TABLE file_fact_jobs (
                ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
                volume_id TEXT NOT NULL, file_reference TEXT NOT NULL,
                kind INTEGER NOT NULL CHECK(kind IN (0,1,2,3,4,5,6,7,8)),
                extractor_version INTEGER NOT NULL CHECK(extractor_version > 0),
                size_bytes INTEGER NOT NULL, modified_file_time INTEGER NOT NULL,
                volume_epoch INTEGER NOT NULL, content_revision INTEGER NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('pending', 'leased', 'done')),
                lease_id TEXT NULL, lease_expires INTEGER NULL, policy_epoch INTEGER NULL,
                CHECK((state = 'leased') = (lease_id IS NOT NULL AND lease_expires IS NOT NULL AND policy_epoch IS NOT NULL)),
                UNIQUE(volume_id, file_reference, kind, extractor_version)
            ) STRICT;
            CREATE INDEX file_fact_jobs_pending ON file_fact_jobs(state, volume_id, ordinal);
            CREATE UNIQUE INDEX file_fact_jobs_lease ON file_fact_jobs(lease_id) WHERE lease_id IS NOT NULL;
            """;
        await command.ExecuteNonQueryAsync(token);
        transaction.Commit();
    }

    public static async Task ValidateAsync(SqliteConnection connection, CancellationToken token)
    {
        await FileFactSchema.ValidateAsync(connection, token);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT schema_version FROM file_fact_queue_state WHERE singleton = 1;";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 8)
            throw new CatalogSchemaException("File fact queue schema version is unsupported.");
        command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('file_fact_queue_state', 'file_fact_jobs');";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 2)
            throw new CatalogSchemaException("File fact queue schema is incomplete.");
    }
}

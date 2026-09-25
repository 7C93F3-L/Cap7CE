using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

internal static class CatalogSchema
{
    public const int CurrentVersion = 1;
    private const int ApplicationId = 1127695173;

    public static async Task InitializeAsync(SqliteConnection connection, CancellationToken cancellationToken)
    {
        var version = await ReadUserVersionAsync(connection, cancellationToken);
        if (version == CurrentVersion)
        {
            await ValidateExistingAsync(connection, cancellationToken);
            return;
        }
        if (version != 0 || await HasUserObjectsAsync(connection, cancellationToken))
        {
            throw new CatalogSchemaException("Catalog schema version is not supported.");
        }

        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = SchemaSql;
        await command.ExecuteNonQueryAsync(cancellationToken);
        transaction.Commit();
    }

    public static async Task ValidateExistingAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        if (await ReadUserVersionAsync(connection, cancellationToken) != CurrentVersion)
        {
            throw new CatalogSchemaException("Catalog schema version is not supported.");
        }
        if (await ReadApplicationIdAsync(connection, cancellationToken) != ApplicationId)
        {
            throw new CatalogSchemaException("Catalog application identity is not supported.");
        }
        await ValidateRequiredTablesAsync(connection, cancellationToken);
    }

    private static async Task<int> ReadUserVersionAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA user_version;";
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task<bool> HasUserObjectsAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%');";
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken)) != 0;
    }

    private static async Task<int> ReadApplicationIdAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA application_id;";
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task ValidateRequiredTablesAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT COUNT(*)
            FROM sqlite_master
            WHERE type = 'table' AND name IN ('catalog_state', 'volumes', 'nodes', 'catalog_tasks');
            """;
        if (Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken)) != 4)
        {
            throw new CatalogSchemaException("Catalog schema is incomplete.");
        }
        command.CommandText = "SELECT COUNT(*) FROM catalog_state WHERE singleton = 1 AND schema_version = 1;";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken)) != 1)
        {
            throw new CatalogSchemaException("Catalog state version is invalid.");
        }
    }

    private const string SchemaSql = """
        PRAGMA application_id = 1127695173;
        PRAGMA user_version = 1;

        CREATE TABLE catalog_state (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            schema_version INTEGER NOT NULL CHECK (schema_version = 1),
            catalog_revision INTEGER NOT NULL CHECK (catalog_revision >= 0),
            committed_snapshot_id TEXT NULL CHECK (committed_snapshot_id IS NULL OR length(committed_snapshot_id) BETWEEN 1 AND 128),
            queryable INTEGER NOT NULL CHECK (queryable IN (0, 1)),
            needs_rebuild INTEGER NOT NULL CHECK (needs_rebuild IN (0, 1))
        ) STRICT;

        INSERT INTO catalog_state VALUES (1, 1, 0, NULL, 0, 0);

        CREATE TABLE volumes (
            volume_id TEXT PRIMARY KEY CHECK (length(volume_id) BETWEEN 1 AND 128),
            file_system TEXT NOT NULL CHECK (length(file_system) BETWEEN 1 AND 32),
            journal_id TEXT NULL CHECK (journal_id IS NULL OR length(journal_id) BETWEEN 1 AND 128),
            checkpoint TEXT NULL CHECK (checkpoint IS NULL OR length(checkpoint) BETWEEN 1 AND 256),
            state TEXT NOT NULL CHECK (state IN ('disabled', 'discovering', 'building', 'ready', 'catchingUp', 'offline', 'degraded', 'needsRebuild')),
            catalog_revision INTEGER NOT NULL CHECK (catalog_revision >= 0)
        ) STRICT;

        CREATE TABLE nodes (
            volume_id TEXT NOT NULL,
            file_reference INTEGER NOT NULL CHECK (file_reference >= 0),
            parent_reference INTEGER NULL CHECK (parent_reference IS NULL OR parent_reference >= 0),
            name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 1024),
            extension TEXT NOT NULL CHECK (length(extension) <= 64),
            is_directory INTEGER NOT NULL CHECK (is_directory IN (0, 1)),
            attributes INTEGER NOT NULL CHECK (attributes >= 0),
            exists_flag INTEGER NOT NULL CHECK (exists_flag IN (0, 1)),
            size_bytes INTEGER NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
            modified_utc_ticks INTEGER NULL CHECK (modified_utc_ticks IS NULL OR modified_utc_ticks >= 0),
            PRIMARY KEY (volume_id, file_reference),
            FOREIGN KEY (volume_id) REFERENCES volumes(volume_id) ON DELETE CASCADE
        ) STRICT, WITHOUT ROWID;

        CREATE INDEX nodes_parent ON nodes(volume_id, parent_reference, file_reference);
        CREATE INDEX nodes_name ON nodes(volume_id, name COLLATE NOCASE, file_reference);
        CREATE INDEX nodes_extension ON nodes(volume_id, extension, file_reference) WHERE exists_flag = 1;

        CREATE TABLE catalog_tasks (
            task_id TEXT PRIMARY KEY CHECK (length(task_id) BETWEEN 1 AND 128),
            volume_id TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 64),
            phase TEXT NOT NULL CHECK (length(phase) BETWEEN 1 AND 64),
            processed INTEGER NOT NULL CHECK (processed >= 0),
            total INTEGER NULL CHECK (total IS NULL OR total >= 0),
            started_utc_ticks INTEGER NOT NULL CHECK (started_utc_ticks >= 0),
            completed_utc_ticks INTEGER NULL CHECK (completed_utc_ticks IS NULL OR completed_utc_ticks >= started_utc_ticks),
            error_code TEXT NULL CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 128),
            FOREIGN KEY (volume_id) REFERENCES volumes(volume_id) ON DELETE CASCADE
        ) STRICT;
        """;
}

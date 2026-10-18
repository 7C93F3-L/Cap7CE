using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

internal static class CatalogV2Schema
{
    private const int ApplicationId = 1127695174;

    public static async Task InitializeAsync(SqliteConnection connection, CancellationToken token, bool createEntryCatalog = false)
    {
        using var version = connection.CreateCommand();
        version.CommandText = "PRAGMA user_version;";
        var current = Convert.ToInt32(await version.ExecuteScalarAsync(token));
        if (current is CatalogV2Contract.SchemaVersion or DirectoryEntries.CatalogFileEntryMode.StorageVersion)
        {
            await ValidateAsync(connection, token);
            return;
        }

        using var objects = connection.CreateCommand();
        objects.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%');";
        if (current != 0 || Convert.ToInt32(await objects.ExecuteScalarAsync(token)) != 0)
        {
            throw new CatalogSchemaException("Catalog v2 requires a safe rebuild instead of an in-place migration.");
        }

        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = SchemaSql;
        await command.ExecuteNonQueryAsync(token);
        if (createEntryCatalog) {
            await DirectoryEntries.CatalogFileEntrySchema.CreateWithinAsync(connection, transaction, token);
            await DirectoryEntries.CatalogFileEntryActivationMarker.CreateAsync(connection, transaction, 0, token);
        }
        token.ThrowIfCancellationRequested();
        transaction.Commit();
    }

    public static async Task ValidateAsync(SqliteConnection connection, CancellationToken token)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA application_id;";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != ApplicationId)
        {
            throw new CatalogSchemaException("Catalog v2 application identity is invalid.");
        }
        command.CommandText = "PRAGMA user_version;";
        await DirectoryEntries.CatalogFileEntryMode.ValidateAsync(connection, null, Convert.ToInt32(await command.ExecuteScalarAsync(token)), token);
        command.CommandText = """
            SELECT COUNT(*) FROM sqlite_master
            WHERE type = 'table' AND name IN (
                'catalog_state_v2', 'catalog_volumes_v2', 'catalog_nodes_v2',
                'catalog_directory_paths_v2', 'catalog_saved_scopes_v2', 'catalog_tasks_v2');
            """;
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 6)
        {
            throw new CatalogSchemaException("Catalog v2 schema is incomplete.");
        }
    }

    private const string SchemaSql = """
        PRAGMA application_id = 1127695174;
        PRAGMA user_version = 2;

        CREATE TABLE catalog_state_v2 (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            schema_version INTEGER NOT NULL CHECK (schema_version = 2),
            catalog_revision INTEGER NOT NULL CHECK (catalog_revision >= 0),
            path_strategy TEXT NOT NULL CHECK (path_strategy = 'directory-path-cache')
        ) STRICT;
        INSERT INTO catalog_state_v2 VALUES (1, 2, 0, 'directory-path-cache');

        CREATE TABLE catalog_volumes_v2 (
            volume_id TEXT PRIMARY KEY CHECK (length(volume_id) BETWEEN 1 AND 64),
            display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 32),
            file_system TEXT NOT NULL CHECK (length(file_system) BETWEEN 1 AND 16),
            selected INTEGER NOT NULL CHECK (selected IN (0, 1)),
            journal_id TEXT NULL CHECK (journal_id IS NULL OR length(journal_id) BETWEEN 1 AND 32),
            checkpoint_usn INTEGER NULL CHECK (checkpoint_usn IS NULL OR checkpoint_usn >= 0),
            journal_first_usn INTEGER NULL CHECK (journal_first_usn IS NULL OR journal_first_usn >= 0),
            journal_lowest_valid_usn INTEGER NULL CHECK (journal_lowest_valid_usn IS NULL OR journal_lowest_valid_usn >= 0),
            state TEXT NOT NULL CHECK (state IN ('disabled', 'building', 'ready', 'catchingUp', 'offline', 'needsRebuild')),
            processed INTEGER NOT NULL CHECK (processed >= 0),
            total INTEGER NULL CHECK (total IS NULL OR total >= 0),
            catalog_revision INTEGER NOT NULL CHECK (catalog_revision >= 0)
        ) STRICT;

        CREATE TABLE catalog_nodes_v2 (
            volume_id TEXT NOT NULL,
            file_reference TEXT NOT NULL CHECK (length(file_reference) = 16),
            parent_file_reference TEXT NULL CHECK (parent_file_reference IS NULL OR length(parent_file_reference) = 16),
            name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 1024),
            extension TEXT NOT NULL CHECK (length(extension) <= 64),
            is_directory INTEGER NOT NULL CHECK (is_directory IN (0, 1)),
            attributes INTEGER NOT NULL CHECK (attributes >= 0),
            exists_flag INTEGER NOT NULL CHECK (exists_flag IN (0, 1)),
            size_bytes INTEGER NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
            created_utc_ticks INTEGER NULL CHECK (created_utc_ticks IS NULL OR created_utc_ticks >= 0),
            modified_utc_ticks INTEGER NULL CHECK (modified_utc_ticks IS NULL OR modified_utc_ticks >= 0),
            PRIMARY KEY (volume_id, file_reference),
            FOREIGN KEY (volume_id) REFERENCES catalog_volumes_v2(volume_id) ON DELETE CASCADE
        ) STRICT, WITHOUT ROWID;
        CREATE INDEX catalog_nodes_v2_parent ON catalog_nodes_v2(volume_id, parent_file_reference, file_reference) WHERE exists_flag = 1;
        CREATE INDEX catalog_nodes_v2_name ON catalog_nodes_v2(name COLLATE NOCASE, volume_id, file_reference) WHERE exists_flag = 1;
        CREATE INDEX catalog_nodes_v2_extension ON catalog_nodes_v2(extension COLLATE NOCASE, volume_id, file_reference) WHERE exists_flag = 1;

        CREATE TABLE catalog_directory_paths_v2 (
            volume_id TEXT NOT NULL,
            file_reference TEXT NOT NULL,
            relative_path TEXT NOT NULL CHECK (length(relative_path) <= 32767),
            PRIMARY KEY (volume_id, file_reference),
            FOREIGN KEY (volume_id, file_reference)
                REFERENCES catalog_nodes_v2(volume_id, file_reference) ON DELETE CASCADE
        ) STRICT, WITHOUT ROWID;
        CREATE INDEX catalog_directory_paths_v2_path ON catalog_directory_paths_v2(volume_id, relative_path COLLATE NOCASE, file_reference);

        CREATE TABLE catalog_saved_scopes_v2 (
            scope_id TEXT PRIMARY KEY CHECK (length(scope_id) BETWEEN 1 AND 128),
            volume_id TEXT NOT NULL,
            root_file_reference TEXT NOT NULL CHECK (length(root_file_reference) = 16),
            created_utc_ticks INTEGER NOT NULL CHECK (created_utc_ticks >= 0),
            FOREIGN KEY (volume_id, root_file_reference)
                REFERENCES catalog_nodes_v2(volume_id, file_reference) ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE catalog_tasks_v2 (
            task_id TEXT PRIMARY KEY CHECK (length(task_id) BETWEEN 1 AND 128),
            volume_id TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 32),
            phase TEXT NOT NULL CHECK (length(phase) BETWEEN 1 AND 32),
            processed INTEGER NOT NULL CHECK (processed >= 0),
            total INTEGER NULL CHECK (total IS NULL OR total >= 0),
            started_utc_ticks INTEGER NOT NULL CHECK (started_utc_ticks >= 0),
            completed_utc_ticks INTEGER NULL CHECK (completed_utc_ticks IS NULL OR completed_utc_ticks >= started_utc_ticks),
            error_code TEXT NULL CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 128),
            FOREIGN KEY (volume_id) REFERENCES catalog_volumes_v2(volume_id) ON DELETE CASCADE
        ) STRICT;
        """;
}

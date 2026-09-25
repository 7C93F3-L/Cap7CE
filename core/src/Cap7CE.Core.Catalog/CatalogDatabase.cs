using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

public sealed partial class CatalogDatabase
{
    public const int MaximumBatchNodes = 10_000;
    public const int MaximumReadPage = 200;
    private readonly string databasePath;

    public CatalogDatabase(string databasePath)
    {
        if (string.IsNullOrWhiteSpace(databasePath)) throw new ArgumentException("Database path is required.", nameof(databasePath));
        this.databasePath = Path.GetFullPath(databasePath);
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        var directory = Path.GetDirectoryName(databasePath)
            ?? throw new ArgumentException("Database path has no parent directory.", nameof(databasePath));
        Directory.CreateDirectory(directory);
        await using var connection = await OpenAsync(readOnly: false, cancellationToken);

        await CatalogSchema.InitializeAsync(connection, cancellationToken);

        using (var command = connection.CreateCommand())
        {
            command.CommandText = "PRAGMA journal_mode = WAL;";
            var journalMode = Convert.ToString(await command.ExecuteScalarAsync(cancellationToken));
            if (!string.Equals(journalMode, "wal", StringComparison.OrdinalIgnoreCase))
            {
                throw new CatalogSchemaException("Catalog could not enable WAL mode.");
            }
        }

        if (!await CheckIntegrityAsync(connection, cancellationToken))
        {
            throw new CatalogSchemaException("Catalog integrity check failed.");
        }
    }

    public async Task<CatalogStateSnapshot> ReadStateAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(readOnly: true, cancellationToken);
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT schema_version, catalog_revision, committed_snapshot_id, queryable, needs_rebuild
            FROM catalog_state WHERE singleton = 1;
            """;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) throw new CatalogSchemaException("Catalog state is missing.");
        return new CatalogStateSnapshot(
            reader.GetInt32(0),
            reader.GetInt64(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.GetInt32(3) != 0,
            reader.GetInt32(4) != 0);
    }

    public async Task<bool> CheckIntegrityAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(readOnly: true, cancellationToken);
        return await CheckIntegrityAsync(connection, cancellationToken);
    }

    public async Task ValidateReadOnlyAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(readOnly: true, cancellationToken);
        await CatalogSchema.ValidateExistingAsync(connection, cancellationToken);
        if (!await CheckIntegrityAsync(connection, cancellationToken))
        {
            throw new CatalogSchemaException("Catalog integrity check failed.");
        }
    }

    public async Task<long> ReadStorageBytesAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await OpenAsync(readOnly: true, cancellationToken);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT (SELECT page_count FROM pragma_page_count()) * (SELECT page_size FROM pragma_page_size());";
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
    }

    private async Task<SqliteConnection> OpenAsync(bool readOnly, CancellationToken cancellationToken)
    {
        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
            Pooling = true
        }.ToString();
        var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL; PRAGMA trusted_schema = OFF;";
        await command.ExecuteNonQueryAsync(cancellationToken);
        return connection;
    }

    private static async Task<bool> CheckIntegrityAsync(
        SqliteConnection connection,
        CancellationToken cancellationToken)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA quick_check;";
        return string.Equals(
            Convert.ToString(await command.ExecuteScalarAsync(cancellationToken)),
            "ok",
            StringComparison.Ordinal);
    }
}

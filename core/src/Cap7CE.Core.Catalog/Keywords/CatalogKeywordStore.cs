using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.Keywords;

public sealed partial class CatalogKeywordStore(string databasePath)
{
    private const string IdentityPredicate = "volume_id=$volume AND file_reference=$file AND created_file_time=$created";
    public async Task<CatalogKeywordSnapshot> ReadAsync(CatalogKeywordIdentity identity, CancellationToken token = default)
    {
        await using var connection = await OpenAsync(true, token);
        var created = await ResolveAsync(connection, null, identity, token);
        return await ReadAsync(connection, null, identity, created, token);
    }

    public async Task<CatalogKeywordWriteResult> WriteAsync(CatalogKeywordIdentity identity, IReadOnlyList<string> keywords,
        string? expectedRevision, CancellationToken token = default)
    {
        var normalized = Normalize(keywords);
        if (expectedRevision is not null && (!long.TryParse(expectedRevision, out var expected) || expected < 0))
            throw new ArgumentException("Invalid keyword revision.");
        await using var connection = await OpenAsync(false, token);
        using var transaction = connection.BeginTransaction();
        var created = await ResolveAsync(connection, transaction, identity, token);
        var current = await ReadAsync(connection, transaction, identity, created, token);
        var revision = await RevisionAsync(connection, transaction, token);
        if (current.Revision != expectedRevision) return new(false, current, revision);
        if (current.Revision is not null && current.Keywords.SequenceEqual(normalized)) return new(true, current, revision);
        revision = checked(revision + 1);
        await PutAsync(connection, transaction, identity, created, normalized, revision, token);
        await SetRevisionAsync(connection, transaction, revision, token);
        transaction.Commit();
        return new(true, new(normalized, revision.ToString(CultureInfo.InvariantCulture)), revision);
    }

    internal static string[] Normalize(IReadOnlyList<string> keywords)
    {
        if (keywords is null || keywords.Count > 128 || keywords.Any(value => value is null || value.Length > 256 || value.Contains('\0')))
            throw new ArgumentException("Invalid keyword list.");
        var result = keywords.Select(value => string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)))
            .Where(value => value.Length > 0).Distinct(StringComparer.Ordinal).ToArray();
        if (string.Join('\n', result).Length > 32768) throw new ArgumentException("Keyword list is too long.");
        return result;
    }

    private async Task<SqliteConnection> OpenAsync(bool readOnly, CancellationToken token)
    {
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = databasePath,
            Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWrite, Pooling = true }.ToString());
        try { await connection.OpenAsync(token); using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;";
            await command.ExecuteNonQueryAsync(token); return connection; }
        catch { await connection.DisposeAsync(); throw; }
    }

    private static void Bind(SqliteCommand command, CatalogKeywordIdentity identity, string? created = null)
    {
        ArgumentNullException.ThrowIfNull(identity);
        CatalogV2Database.ValidateIdentity(new(identity.VolumeId, identity.FileReference));
        command.Parameters.AddWithValue("$volume", identity.VolumeId);
        command.Parameters.AddWithValue("$file", identity.FileReference);
        if (created is not null) command.Parameters.AddWithValue("$created", created);
    }

    private static async Task<string> ResolveAsync(SqliteConnection connection, SqliteTransaction? transaction,
        CatalogKeywordIdentity identity, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        Bind(command, identity);
        command.CommandText = """
            SELECT COALESCE(CAST(n.created_utc_ticks AS TEXT), ''), COALESCE(CAST(n.created_utc_ticks/10000 AS TEXT), '')
            FROM catalog_nodes_v2 n JOIN catalog_volumes_v2 v ON v.volume_id=n.volume_id
            WHERE n.volume_id=$volume AND n.file_reference=$file AND n.is_directory=0 AND n.exists_flag=1
                AND v.selected=1 AND v.state IN ('ready','catchingUp');
            """;
        await using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token) || reader.GetString(1) != (identity.CreatedFileTimeMilliseconds ?? ""))
            throw new ArgumentException("Keyword source is no longer current.");
        return reader.GetString(0);
    }

    private static async Task<CatalogKeywordSnapshot> ReadAsync(SqliteConnection connection, SqliteTransaction? transaction,
        CatalogKeywordIdentity identity, string created, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction; Bind(command, identity, created);
        command.CommandText = $"SELECT keywords_json, CAST(revision AS TEXT) FROM catalog_manual_keywords WHERE {IdentityPredicate};";
        await using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token) ? new(JsonSerializer.Deserialize<string[]>(reader.GetString(0))!, reader.GetString(1)) : new([], null);
    }

    private static async Task PutAsync(SqliteConnection connection, SqliteTransaction transaction, CatalogKeywordIdentity identity,
        string created, string[] keywords, long revision, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction; Bind(command, identity, created);
        command.CommandText = """
            INSERT INTO catalog_manual_keywords VALUES($volume,$file,$created,$json,$search,$revision)
            ON CONFLICT(volume_id,file_reference,created_file_time) DO UPDATE SET
                keywords_json=excluded.keywords_json, search_text=excluded.search_text, revision=excluded.revision;
            """;
        command.Parameters.AddWithValue("$json", JsonSerializer.Serialize(keywords));
        command.Parameters.AddWithValue("$search", string.Join('\n', keywords)); command.Parameters.AddWithValue("$revision", revision);
        await command.ExecuteNonQueryAsync(token);
    }

    private static async Task<long> RevisionAsync(SqliteConnection connection, SqliteTransaction transaction, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = "SELECT catalog_revision FROM catalog_state_v2 WHERE singleton=1;";
        return Convert.ToInt64(await command.ExecuteScalarAsync(token));
    }
    private static async Task SetRevisionAsync(SqliteConnection connection, SqliteTransaction transaction, long revision, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = "UPDATE catalog_state_v2 SET catalog_revision=$revision WHERE singleton=1;";
        command.Parameters.AddWithValue("$revision", revision); await command.ExecuteNonQueryAsync(token);
    }
}

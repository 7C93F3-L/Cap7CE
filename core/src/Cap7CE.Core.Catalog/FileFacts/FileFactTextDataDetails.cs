using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactTextDataProperties(string FactKind, long? CharacterCount = null, long? LineCount = null,
    long? RecordCount = null, long? ColumnCount = null, string? JsonRootKind = null);

internal static class FileFactTextDataDetails
{
    public const string CreateTableSql = """
        CREATE TABLE file_fact_text_data_details (
            volume_id TEXT NOT NULL, file_reference TEXT NOT NULL, kind INTEGER NOT NULL CHECK(kind = 7),
            fact_kind TEXT NOT NULL CHECK(fact_kind IN ('text','csv','json')),
            character_count INTEGER NULL CHECK(character_count BETWEEN 0 AND 9007199254740991),
            line_count INTEGER NULL CHECK(line_count BETWEEN 0 AND 9007199254740991),
            record_count INTEGER NULL CHECK(record_count BETWEEN 0 AND 9007199254740991),
            column_count INTEGER NULL CHECK(column_count BETWEEN 0 AND 9007199254740991),
            json_root_kind TEXT NULL CHECK(json_root_kind IN ('array','object')),
            CHECK((fact_kind = 'text' AND character_count IS NOT NULL AND line_count IS NOT NULL
                AND record_count IS NULL AND column_count IS NULL AND json_root_kind IS NULL)
              OR (fact_kind = 'csv' AND record_count IS NOT NULL AND column_count IS NOT NULL
                AND character_count IS NULL AND line_count IS NULL AND json_root_kind IS NULL)
              OR (fact_kind = 'json' AND record_count IS NOT NULL AND json_root_kind IS NOT NULL
                AND character_count IS NULL AND line_count IS NULL AND column_count IS NULL)),
            PRIMARY KEY(volume_id, file_reference, kind),
            FOREIGN KEY(volume_id, file_reference, kind) REFERENCES file_facts(volume_id, file_reference, kind) ON DELETE CASCADE
        ) STRICT, WITHOUT ROWID;
        """;
    public static void Validate(FileFactObservation observation)
    {
        if (observation.TextDataProperties is { } properties)
        {
            if (observation.Kind != FileFactKind.TextData || observation.State != FileFactState.Indexed
                || new[] { properties.CharacterCount, properties.LineCount, properties.RecordCount, properties.ColumnCount }
                    .Any(value => value is < 0 or > 9_007_199_254_740_991))
                throw new ArgumentException("Invalid text/data property vector.");
            var valid = properties.FactKind switch
            {
                "text" => properties.CharacterCount is not null && properties.LineCount is not null
                    && properties.RecordCount is null && properties.ColumnCount is null && properties.JsonRootKind is null,
                "csv" => properties.RecordCount is not null && properties.ColumnCount is not null
                    && properties.CharacterCount is null && properties.LineCount is null && properties.JsonRootKind is null,
                "json" => properties.RecordCount is not null && properties.JsonRootKind is "array" or "object"
                    && properties.CharacterCount is null && properties.LineCount is null && properties.ColumnCount is null,
                _ => false
            };
            if (!valid) throw new ArgumentException("Invalid text/data subkind properties.");
        }
        if (observation.Kind == FileFactKind.TextData && (observation.Width is not null || observation.DurationMilliseconds is not null
            || observation.State == FileFactState.Indexed && observation.TextDataProperties is null))
            throw new ArgumentException("Invalid text/data observation.");
    }
    public static async Task PublishAsync(SqliteConnection connection, SqliteTransaction transaction,
        FileFactObservation observation, CancellationToken token)
    {
        if (observation.Kind != FileFactKind.TextData) return;
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, observation.Identity);
        command.CommandText = "DELETE FROM file_fact_text_data_details WHERE volume_id=$volume AND file_reference=$reference AND kind=7;";
        await command.ExecuteNonQueryAsync(token);
        if (observation.TextDataProperties is not { } properties) return;
        command.CommandText = "INSERT INTO file_fact_text_data_details VALUES($volume,$reference,7,$subkind,$characters,$lines,$records,$columns,$root);";
        command.Parameters.AddWithValue("$subkind", properties.FactKind);
        command.Parameters.AddWithValue("$characters", (object?)properties.CharacterCount ?? DBNull.Value);
        command.Parameters.AddWithValue("$lines", (object?)properties.LineCount ?? DBNull.Value);
        command.Parameters.AddWithValue("$records", (object?)properties.RecordCount ?? DBNull.Value);
        command.Parameters.AddWithValue("$columns", (object?)properties.ColumnCount ?? DBNull.Value);
        command.Parameters.AddWithValue("$root", (object?)properties.JsonRootKind ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(token);
    }
    public static async Task<FileFactTextDataProperties?> ReadAsync(SqliteConnection connection, SqliteTransaction transaction,
        CatalogEntryIdentity identity, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, identity);
        command.CommandText = "SELECT fact_kind,character_count,line_count,record_count,column_count,json_root_kind FROM file_fact_text_data_details WHERE volume_id=$volume AND file_reference=$reference AND kind=7;";
        using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token) ? new(reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetInt64(1),
            reader.IsDBNull(2) ? null : reader.GetInt64(2), reader.IsDBNull(3) ? null : reader.GetInt64(3),
            reader.IsDBNull(4) ? null : reader.GetInt64(4), reader.IsDBNull(5) ? null : reader.GetString(5)) : null;
    }
}

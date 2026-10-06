using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

// Nullable constructor fields distinguish omitted protocol fields from known false.
public sealed record FileFactFontProperties(int? Weight = null, bool? Italic = null,
    bool? SupportsLatin = null, bool? SupportsChinese = null, bool? Variable = null);

internal static class FileFactFontDetails
{
    public const string CreateTableSql = """
        CREATE TABLE file_fact_font_details (
            volume_id TEXT NOT NULL, file_reference TEXT NOT NULL,
            kind INTEGER NOT NULL CHECK(kind = 3),
            weight INTEGER NOT NULL CHECK(weight BETWEEN 1 AND 1000),
            italic INTEGER NOT NULL CHECK(italic IN (0,1)),
            supports_latin INTEGER NOT NULL CHECK(supports_latin IN (0,1)),
            supports_chinese INTEGER NOT NULL CHECK(supports_chinese IN (0,1)),
            variable INTEGER NOT NULL CHECK(variable IN (0,1)),
            PRIMARY KEY(volume_id, file_reference, kind),
            FOREIGN KEY(volume_id, file_reference, kind) REFERENCES file_facts(volume_id, file_reference, kind) ON DELETE CASCADE
        ) STRICT, WITHOUT ROWID;
        """;

    public static void Validate(FileFactObservation observation)
    {
        if (observation.FontProperties is { } properties && (observation.Kind != FileFactKind.Font
            || observation.State != FileFactState.Indexed || properties.Weight is not (>= 1 and <= 1000)
            || properties.Italic is null || properties.SupportsLatin is null || properties.SupportsChinese is null || properties.Variable is null))
            throw new ArgumentException("Invalid font property vector.");
        if (observation.Kind == FileFactKind.Font && (observation.Width is not null || observation.DurationMilliseconds is not null
            || (observation.State == FileFactState.Indexed && observation.FontProperties is null)))
            throw new ArgumentException("Invalid font observation.");
    }

    public static async Task PublishAsync(SqliteConnection connection, SqliteTransaction transaction,
        FileFactObservation observation, CancellationToken token)
    {
        if (observation.Kind != FileFactKind.Font) return;
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, observation.Identity);
        command.CommandText = "DELETE FROM file_fact_font_details WHERE volume_id = $volume AND file_reference = $reference AND kind = 3;";
        await command.ExecuteNonQueryAsync(token);
        if (observation.FontProperties is not { } properties) return;
        command.CommandText = "INSERT INTO file_fact_font_details VALUES($volume,$reference,3,$weight,$italic,$latin,$chinese,$variable);";
        command.Parameters.AddWithValue("$weight", properties.Weight!.Value);
        command.Parameters.AddWithValue("$italic", properties.Italic!.Value ? 1 : 0);
        command.Parameters.AddWithValue("$latin", properties.SupportsLatin!.Value ? 1 : 0);
        command.Parameters.AddWithValue("$chinese", properties.SupportsChinese!.Value ? 1 : 0);
        command.Parameters.AddWithValue("$variable", properties.Variable!.Value ? 1 : 0);
        await command.ExecuteNonQueryAsync(token);
    }

    public static async Task<FileFactFontProperties?> ReadAsync(SqliteConnection connection, SqliteTransaction transaction,
        CatalogEntryIdentity identity, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, identity);
        command.CommandText = "SELECT weight,italic,supports_latin,supports_chinese,variable FROM file_fact_font_details WHERE volume_id = $volume AND file_reference = $reference AND kind = 3;";
        using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token) ? new(reader.GetInt32(0), reader.GetInt32(1) == 1,
            reader.GetInt32(2) == 1, reader.GetInt32(3) == 1, reader.GetInt32(4) == 1) : null;
    }
}

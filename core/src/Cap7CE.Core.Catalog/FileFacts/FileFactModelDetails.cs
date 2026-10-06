using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactModelProperties(long? ParameterCount = null, string? Precision = null);

internal static class FileFactModelDetails
{
    public const long MaximumParameterCount = 9_007_199_254_740_991;
    public static bool ValidPrecision(string? value) => value is "f32" or "f16-bf16" or "8bit" or "6bit" or "5bit" or "4bit" or "3bit-or-less";
    public const string CreateTableSql = """
        CREATE TABLE file_fact_model_details (
            volume_id TEXT NOT NULL, file_reference TEXT NOT NULL,
            kind INTEGER NOT NULL CHECK(kind = 4),
            parameter_count INTEGER NOT NULL CHECK(parameter_count BETWEEN 1 AND 9007199254740991),
            precision TEXT NOT NULL CHECK(precision IN ('f32','f16-bf16','8bit','6bit','5bit','4bit','3bit-or-less')),
            PRIMARY KEY(volume_id, file_reference, kind),
            FOREIGN KEY(volume_id, file_reference, kind) REFERENCES file_facts(volume_id, file_reference, kind) ON DELETE CASCADE
        ) STRICT, WITHOUT ROWID;
        """;
    public static void Validate(FileFactObservation observation)
    {
        if (observation.ModelProperties is { } model && (observation.Kind != FileFactKind.Model
            || observation.State != FileFactState.Indexed || model.ParameterCount is not (>= 1 and <= MaximumParameterCount)
            || !ValidPrecision(model.Precision))) throw new ArgumentException("Invalid model property vector.");
        if (observation.Kind == FileFactKind.Model && (observation.Width is not null || observation.DurationMilliseconds is not null
            || (observation.State == FileFactState.Indexed && observation.ModelProperties is null)))
            throw new ArgumentException("Invalid model observation.");
    }
    public static async Task PublishAsync(SqliteConnection connection, SqliteTransaction transaction,
        FileFactObservation observation, CancellationToken token)
    {
        if (observation.Kind != FileFactKind.Model) return;
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, observation.Identity);
        command.CommandText = "DELETE FROM file_fact_model_details WHERE volume_id = $volume AND file_reference = $reference AND kind = 4;";
        await command.ExecuteNonQueryAsync(token);
        if (observation.ModelProperties is not { } model) return;
        command.CommandText = "INSERT INTO file_fact_model_details VALUES($volume,$reference,4,$count,$precision);";
        command.Parameters.AddWithValue("$count", model.ParameterCount!.Value);
        command.Parameters.AddWithValue("$precision", model.Precision!);
        await command.ExecuteNonQueryAsync(token);
    }
    public static async Task<FileFactModelProperties?> ReadAsync(SqliteConnection connection, SqliteTransaction transaction,
        CatalogEntryIdentity identity, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, identity);
        command.CommandText = "SELECT parameter_count,precision FROM file_fact_model_details WHERE volume_id = $volume AND file_reference = $reference AND kind = 4;";
        using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token) ? new(reader.GetInt64(0), reader.GetString(1)) : null;
    }
}

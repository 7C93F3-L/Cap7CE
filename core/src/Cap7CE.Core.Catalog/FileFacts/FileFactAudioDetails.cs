using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

internal static class FileFactAudioDetails
{
    public const string CreateTableSql = """
        CREATE TABLE file_fact_audio_details (
            volume_id TEXT NOT NULL, file_reference TEXT NOT NULL,
            kind INTEGER NOT NULL CHECK(kind = 2),
            channel_count INTEGER NOT NULL CHECK(channel_count BETWEEN 1 AND 2147483647),
            PRIMARY KEY(volume_id, file_reference, kind),
            FOREIGN KEY(volume_id, file_reference, kind) REFERENCES file_facts(volume_id, file_reference, kind) ON DELETE CASCADE
        ) STRICT, WITHOUT ROWID;
        """;

    public static async Task PublishAsync(SqliteConnection connection, SqliteTransaction transaction,
        FileFactObservation observation, CancellationToken token)
    {
        if (observation.Kind != FileFactKind.Audio) return;
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, observation.Identity);
        command.CommandText = "DELETE FROM file_fact_audio_details WHERE volume_id = $volume AND file_reference = $reference AND kind = 2;";
        await command.ExecuteNonQueryAsync(token);
        if (observation.ChannelCount is null) return;
        command.CommandText = "INSERT INTO file_fact_audio_details VALUES($volume, $reference, 2, $channels);";
        command.Parameters.AddWithValue("$channels", observation.ChannelCount.Value);
        await command.ExecuteNonQueryAsync(token);
    }

    public static async Task<int?> ReadAsync(SqliteConnection connection, SqliteTransaction transaction,
        CatalogEntryIdentity identity, CancellationToken token)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, identity);
        command.CommandText = "SELECT channel_count FROM file_fact_audio_details WHERE volume_id = $volume AND file_reference = $reference AND kind = 2;";
        var value = await command.ExecuteScalarAsync(token);
        return value is null or DBNull ? null : Convert.ToInt32(value);
    }
}

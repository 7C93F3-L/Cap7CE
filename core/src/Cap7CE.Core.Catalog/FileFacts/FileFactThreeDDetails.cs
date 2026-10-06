using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactThreeDProperties(long? TriangleCount = null, bool? HasAnimation = null, bool? HasRig = null);

internal static class FileFactThreeDDetails
{
    public const string CreateTableSql = """
        CREATE TABLE file_fact_three_d_details (
            volume_id TEXT NOT NULL, file_reference TEXT NOT NULL,
            kind INTEGER NOT NULL CHECK(kind = 6),
            triangle_count INTEGER NULL CHECK(triangle_count BETWEEN 0 AND 9007199254740991),
            has_animation INTEGER NULL CHECK(has_animation IN (0,1)),
            has_rig INTEGER NULL CHECK(has_rig IN (0,1)),
            CHECK(triangle_count IS NOT NULL OR has_animation IS NOT NULL OR has_rig IS NOT NULL),
            PRIMARY KEY(volume_id, file_reference, kind),
            FOREIGN KEY(volume_id, file_reference, kind) REFERENCES file_facts(volume_id, file_reference, kind) ON DELETE CASCADE
        ) STRICT, WITHOUT ROWID;
        """;
    public static void Validate(FileFactObservation observation)
    {
        if (observation.ThreeDProperties is { } properties && (observation.Kind != FileFactKind.ThreeD
            || observation.State != FileFactState.Indexed || properties.TriangleCount is < 0 or > 9_007_199_254_740_991
            || (properties.TriangleCount is null && properties.HasAnimation is null && properties.HasRig is null)))
            throw new ArgumentException("Invalid 3D property vector.");
        if (observation.Kind == FileFactKind.ThreeD && (observation.Width is not null || observation.DurationMilliseconds is not null
            || (observation.State == FileFactState.Indexed && observation.ThreeDProperties is null)))
            throw new ArgumentException("Invalid 3D observation.");
    }
    public static async Task PublishAsync(SqliteConnection connection, SqliteTransaction transaction,
        FileFactObservation observation, CancellationToken token)
    {
        if (observation.Kind != FileFactKind.ThreeD) return;
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, observation.Identity);
        command.CommandText = "DELETE FROM file_fact_three_d_details WHERE volume_id = $volume AND file_reference = $reference AND kind = 6;";
        await command.ExecuteNonQueryAsync(token);
        if (observation.ThreeDProperties is not { } properties) return;
        command.CommandText = "INSERT INTO file_fact_three_d_details VALUES($volume,$reference,6,$count,$animation,$rig);";
        command.Parameters.AddWithValue("$count", (object?)properties.TriangleCount ?? DBNull.Value);
        command.Parameters.AddWithValue("$animation", properties.HasAnimation is { } animation ? animation ? 1 : 0 : DBNull.Value);
        command.Parameters.AddWithValue("$rig", properties.HasRig is { } rig ? rig ? 1 : 0 : DBNull.Value);
        await command.ExecuteNonQueryAsync(token);
    }
    public static async Task<FileFactThreeDProperties?> ReadAsync(SqliteConnection connection, SqliteTransaction transaction,
        CatalogEntryIdentity identity, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, identity);
        command.CommandText = "SELECT triangle_count,has_animation,has_rig FROM file_fact_three_d_details WHERE volume_id = $volume AND file_reference = $reference AND kind = 6;";
        using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token) ? new(reader.IsDBNull(0) ? null : reader.GetInt64(0),
            reader.IsDBNull(1) ? null : reader.GetInt32(1) == 1, reader.IsDBNull(2) ? null : reader.GetInt32(2) == 1) : null;
    }
}

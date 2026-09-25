using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

public sealed partial class CatalogDatabase
{
    private static async Task<long> ReadCatalogRevisionAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT catalog_revision FROM catalog_state WHERE singleton = 1;";
        var value = await command.ExecuteScalarAsync(cancellationToken);
        if (value is null) throw new CatalogSchemaException("Catalog state is missing.");
        return Convert.ToInt64(value);
    }

    private static async Task<CatalogVolumeSnapshot?> ReadVolumeAsync(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        string volumeId,
        CancellationToken cancellationToken)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT volume_id, file_system, journal_id, checkpoint, state, catalog_revision
            FROM volumes WHERE volume_id = $volumeId;
            """;
        command.Parameters.AddWithValue("$volumeId", volumeId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new CatalogVolumeSnapshot(
            reader.GetString(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            CatalogVolumeStateMachine.FromStorage(reader.GetString(4)),
            reader.GetInt64(5));
    }

    private static async Task RefreshAvailabilityAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            UPDATE catalog_state
            SET queryable = EXISTS(
                    SELECT 1 FROM volumes WHERE state IN ('ready', 'catchingUp')
                ),
                needs_rebuild = EXISTS(
                    SELECT 1 FROM volumes WHERE state = 'needsRebuild'
                )
            WHERE singleton = 1;
            """;
        if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
        {
            throw new CatalogSchemaException("Catalog state is missing.");
        }
    }

    private static long NextRevision(long currentRevision)
    {
        try
        {
            return checked(currentRevision + 1);
        }
        catch (OverflowException error)
        {
            throw new CatalogConcurrencyException("Catalog revision is exhausted.", error);
        }
    }

    private static string RequireBoundedText(string value, int maximumLength, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > maximumLength)
        {
            throw new ArgumentException($"{parameterName} must contain between 1 and {maximumLength} characters.", parameterName);
        }
        return value;
    }
}

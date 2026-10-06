using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactArchiveProperties(bool ListingComplete, long? FileCount, bool? HasDirectories,
    IReadOnlyList<string> ContentTypes);

internal static class FileFactArchiveDetails
{
    internal static readonly string[] ContentTypes = ["image", "video", "audio", "document", "project", "threeD", "program", "other"];
    public const string CreateTableSql = """
        CREATE TABLE file_fact_archive_details (
            volume_id TEXT NOT NULL, file_reference TEXT NOT NULL, kind INTEGER NOT NULL CHECK(kind = 8),
            listing_complete INTEGER NOT NULL CHECK(listing_complete IN (0,1)),
            file_count INTEGER NULL CHECK(file_count BETWEEN 0 AND 9007199254740991),
            has_directories INTEGER NULL CHECK(has_directories IN (0,1)),
            content_types INTEGER NOT NULL CHECK(content_types BETWEEN 0 AND 255),
            CHECK((listing_complete = 1 AND file_count IS NOT NULL AND has_directories IS NOT NULL)
                OR (listing_complete = 0 AND file_count IS NULL AND (has_directories = 1 OR has_directories IS NULL))),
            CHECK(listing_complete = 1 OR has_directories = 1 OR content_types > 0),
            PRIMARY KEY(volume_id, file_reference, kind),
            FOREIGN KEY(volume_id, file_reference, kind) REFERENCES file_facts(volume_id, file_reference, kind) ON DELETE CASCADE
        ) STRICT, WITHOUT ROWID;
        """;
    public static void Validate(FileFactObservation observation)
    {
        if (observation.ArchiveProperties is { } properties)
        {
            if (observation.Kind != FileFactKind.Archive || observation.State != FileFactState.Indexed
                || properties.FileCount is < 0 or > 9_007_199_254_740_991 || properties.ContentTypes is null
                || properties.ContentTypes.Count > 8 || properties.ContentTypes.Distinct().Count() != properties.ContentTypes.Count
                || properties.ContentTypes.Any(value => !ContentTypes.Contains(value))
                || (properties.ListingComplete ? properties.FileCount is null || properties.HasDirectories is null
                    : properties.FileCount is not null || properties.HasDirectories == false
                        || properties.HasDirectories is null && properties.ContentTypes.Count == 0))
                throw new ArgumentException("Invalid archive property vector.");
        }
        if (observation.Kind == FileFactKind.Archive && (observation.Width is not null || observation.DurationMilliseconds is not null
            || observation.State == FileFactState.Indexed && observation.ArchiveProperties is null))
            throw new ArgumentException("Invalid archive observation.");
    }
    public static async Task PublishAsync(SqliteConnection connection, SqliteTransaction transaction,
        FileFactObservation observation, CancellationToken token)
    {
        if (observation.Kind != FileFactKind.Archive) return;
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, observation.Identity);
        command.CommandText = "DELETE FROM file_fact_archive_details WHERE volume_id=$volume AND file_reference=$reference AND kind=8;";
        await command.ExecuteNonQueryAsync(token);
        if (observation.ArchiveProperties is not { } properties) return;
        command.CommandText = "INSERT INTO file_fact_archive_details VALUES($volume,$reference,8,$complete,$count,$directories,$types);";
        command.Parameters.AddWithValue("$complete", properties.ListingComplete ? 1 : 0);
        command.Parameters.AddWithValue("$count", (object?)properties.FileCount ?? DBNull.Value);
        command.Parameters.AddWithValue("$directories", properties.HasDirectories is { } nested ? (nested ? 1 : 0) : DBNull.Value);
        command.Parameters.AddWithValue("$types", properties.ContentTypes.Aggregate(0, (bits, value) => bits | (1 << Array.IndexOf(ContentTypes, value))));
        await command.ExecuteNonQueryAsync(token);
    }
    public static async Task<FileFactArchiveProperties?> ReadAsync(SqliteConnection connection, SqliteTransaction transaction,
        CatalogEntryIdentity identity, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, identity);
        command.CommandText = "SELECT listing_complete,file_count,has_directories,content_types FROM file_fact_archive_details WHERE volume_id=$volume AND file_reference=$reference AND kind=8;";
        using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token)) return null;
        var bits = reader.GetInt32(3);
        return new(reader.GetInt32(0) == 1, reader.IsDBNull(1) ? null : reader.GetInt64(1),
            reader.IsDBNull(2) ? null : reader.GetInt32(2) == 1,
            ContentTypes.Where((_, index) => (bits & (1 << index)) != 0).ToArray());
    }
}

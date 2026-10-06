using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

// Unknown counts/composition stay null; a known zero artboard count stays zero.
public sealed record FileFactDocumentProperties(int? ContentCount = null, string? CountKind = null,
    bool? HasEmbeddedImages = null, int? ArtboardCount = null);

internal static class FileFactDocumentDetails
{
    public const string CreateTableSql = """
        CREATE TABLE file_fact_document_details (
            volume_id TEXT NOT NULL, file_reference TEXT NOT NULL,
            kind INTEGER NOT NULL CHECK(kind = 5),
            content_count INTEGER NULL CHECK(content_count BETWEEN 1 AND 100000),
            count_kind TEXT NULL CHECK(count_kind IN ('pages','slides','sheets')),
            has_images INTEGER NULL CHECK(has_images IN (0,1)),
            artboard_count INTEGER NULL CHECK(artboard_count BETWEEN 0 AND 100000),
            CHECK((content_count IS NULL) = (count_kind IS NULL)),
            CHECK(content_count IS NOT NULL OR artboard_count IS NOT NULL),
            PRIMARY KEY(volume_id, file_reference, kind),
            FOREIGN KEY(volume_id, file_reference, kind) REFERENCES file_facts(volume_id, file_reference, kind) ON DELETE CASCADE
        ) STRICT, WITHOUT ROWID;
        """;
    public static void Validate(FileFactObservation observation)
    {
        if (observation.DocumentProperties is { } document && (observation.Kind != FileFactKind.Document
            || observation.State != FileFactState.Indexed || document.ContentCount is < 1 or > 100000
            || document.ArtboardCount is < 0 or > 100000 || (document.ContentCount is null) != (document.CountKind is null)
            || (document.CountKind is not null && document.CountKind is not ("pages" or "slides" or "sheets"))
            || (document.ContentCount is null && document.ArtboardCount is null)))
            throw new ArgumentException("Invalid document property vector.");
        if (observation.Kind == FileFactKind.Document && (observation.Width is not null || observation.DurationMilliseconds is not null
            || (observation.State == FileFactState.Indexed && observation.DocumentProperties is null)))
            throw new ArgumentException("Invalid document observation.");
    }
    public static async Task PublishAsync(SqliteConnection connection, SqliteTransaction transaction,
        FileFactObservation observation, CancellationToken token)
    {
        if (observation.Kind != FileFactKind.Document) return;
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, observation.Identity);
        command.CommandText = "DELETE FROM file_fact_document_details WHERE volume_id = $volume AND file_reference = $reference AND kind = 5;";
        await command.ExecuteNonQueryAsync(token);
        if (observation.DocumentProperties is not { } document) return;
        command.CommandText = "INSERT INTO file_fact_document_details VALUES($volume,$reference,5,$count,$kind,$images,$artboards);";
        command.Parameters.AddWithValue("$count", (object?)document.ContentCount ?? DBNull.Value);
        command.Parameters.AddWithValue("$kind", (object?)document.CountKind ?? DBNull.Value);
        command.Parameters.AddWithValue("$images", document.HasEmbeddedImages is { } images ? images ? 1 : 0 : DBNull.Value);
        command.Parameters.AddWithValue("$artboards", (object?)document.ArtboardCount ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(token);
    }
    public static async Task<FileFactDocumentProperties?> ReadAsync(SqliteConnection connection, SqliteTransaction transaction,
        CatalogEntryIdentity identity, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, identity);
        command.CommandText = "SELECT content_count,count_kind,has_images,artboard_count FROM file_fact_document_details WHERE volume_id = $volume AND file_reference = $reference AND kind = 5;";
        using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token) ? new(reader.IsDBNull(0) ? null : reader.GetInt32(0), reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetInt32(2) == 1, reader.IsDBNull(3) ? null : reader.GetInt32(3)) : null;
    }
}

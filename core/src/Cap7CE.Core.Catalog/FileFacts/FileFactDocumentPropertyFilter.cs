using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactDocumentFilter(int? MinimumContentCount = null, int? MaximumContentCount = null,
    bool? HasEmbeddedImages = null, int? MinimumArtboardCount = null, int? MaximumArtboardCount = null);

internal static class FileFactDocumentPropertySql
{
    public static void Validate(FileFactQueryFilter filter)
    {
        if (filter.Document is not null && filter.Kind != FileFactKind.Document)
            throw new ArgumentException("Document conditions require document facts.");
        if (filter.Kind == FileFactKind.Document && (filter.MinimumWidth is not null || filter.MaximumWidth is not null
            || filter.MinimumHeight is not null || filter.MaximumHeight is not null || filter.MinimumAspectRatio is not null
            || filter.MaximumAspectRatio is not null || filter.AspectRanges is not null || filter.ShortEdgeRanges is not null
            || filter.MinimumDurationMilliseconds is not null || filter.MaximumDurationMilliseconds is not null))
            throw new ArgumentException("Document cannot have dimensions or duration.");
        if (filter.Document is not { } document) return;
        if (document.MinimumContentCount is < 1 or > 100000 || document.MaximumContentCount is < 1 or > 100000
            || document.MinimumArtboardCount is < 0 or > 1_000_000_000 || document.MaximumArtboardCount is < 0 or > 1_000_000_000
            || document.MinimumContentCount > document.MaximumContentCount || document.MinimumArtboardCount > document.MaximumArtboardCount)
            throw new ArgumentException("Invalid document count range.");
    }
    public static void Append(StringBuilder sql, SqliteCommand command, FileFactQueryFilter filter)
    {
        if (filter.Kind != FileFactKind.Document) return;
        sql.Append(" AND EXISTS (SELECT 1 FROM file_fact_document_details dp WHERE dp.volume_id = ff.volume_id AND dp.file_reference = ff.file_reference AND dp.kind = 5");
        if (filter.Document is { } document)
        {
            foreach (var (column, op, value, key) in new[] {
                ("content_count", ">=", document.MinimumContentCount, "contentMin"), ("content_count", "<=", document.MaximumContentCount, "contentMax"),
                ("artboard_count", ">=", document.MinimumArtboardCount, "artboardMin"), ("artboard_count", "<=", document.MaximumArtboardCount, "artboardMax") })
                if (value is { } known)
                {
                    sql.Append($" AND dp.{column} {op} $document_{key}");
                    command.Parameters.AddWithValue("$document_" + key, known);
                }
            if (document.HasEmbeddedImages is { } images)
            {
                sql.Append(" AND dp.has_images = $documentImages");
                command.Parameters.AddWithValue("$documentImages", images ? 1 : 0);
            }
        }
        sql.Append(')');
    }
}

using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactArchiveFilter(long? MinimumFileCount = null, long? MaximumFileCount = null,
    IReadOnlyList<string>? ContentTypes = null, IReadOnlyList<string>? Structures = null);

internal static class FileFactArchivePropertySql
{
    public static void Validate(FileFactQueryFilter filter)
    {
        if (filter.Archive is not null && filter.Kind != FileFactKind.Archive)
            throw new ArgumentException("Archive conditions require archive facts.");
        if (filter.Kind == FileFactKind.Archive && (filter.MinimumWidth is not null || filter.MaximumWidth is not null
            || filter.MinimumHeight is not null || filter.MaximumHeight is not null || filter.MinimumAspectRatio is not null
            || filter.MaximumAspectRatio is not null || filter.AspectRanges is not null || filter.ShortEdgeRanges is not null
            || filter.MinimumDurationMilliseconds is not null || filter.MaximumDurationMilliseconds is not null))
            throw new ArgumentException("Archive cannot have dimensions or duration.");
        if (filter.Archive is not { } properties) return;
        if (properties.MinimumFileCount is < 0 or > 2_000_000_000 || properties.MaximumFileCount is < 0 or > 2_000_000_000
            || properties.MinimumFileCount > properties.MaximumFileCount
            || properties.ContentTypes is { } types && (types.Count is < 1 or > 8 || types.Any(value => !FileFactArchiveDetails.ContentTypes.Contains(value)))
            || properties.Structures is { } structures && (structures.Count is < 1 or > 2 || structures.Any(value => value is not ("flat" or "nested"))))
            throw new ArgumentException("Invalid archive conditions.");
    }
    public static void Append(StringBuilder sql, SqliteCommand command, FileFactQueryFilter filter)
    {
        if (filter.Kind != FileFactKind.Archive) return;
        sql.Append(" AND EXISTS (SELECT 1 FROM file_fact_archive_details ar WHERE ar.volume_id=ff.volume_id AND ar.file_reference=ff.file_reference AND ar.kind=8");
        if (filter.Archive is { } properties)
        {
            if (properties.MinimumFileCount is { } min) { sql.Append(" AND ar.file_count >= $archiveMin"); command.Parameters.AddWithValue("$archiveMin", min); }
            if (properties.MaximumFileCount is { } max) { sql.Append(" AND ar.file_count <= $archiveMax"); command.Parameters.AddWithValue("$archiveMax", max); }
            if (properties.ContentTypes is { } types) {
                sql.Append(" AND (ar.content_types & $archiveTypes) != 0");
                command.Parameters.AddWithValue("$archiveTypes", types.Aggregate(0, (bits, value) => bits | (1 << Array.IndexOf(FileFactArchiveDetails.ContentTypes, value))));
            }
            if (properties.Structures is { } structures) {
                sql.Append(" AND (");
                for (var i = 0; i < structures.Count; i++) {
                    if (i > 0) sql.Append(" OR ");
                    sql.Append(structures[i] == "flat" ? "ar.has_directories = 0" : "ar.has_directories = 1");
                }
                sql.Append(')');
            }
        }
        sql.Append(')');
    }
}

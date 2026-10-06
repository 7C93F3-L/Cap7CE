using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactThreeDFilter(long? MinimumTriangleCount = null, long? MaximumTriangleCount = null,
    IReadOnlyList<string>? Structures = null);

internal static class FileFactThreeDPropertySql
{
    public static void Validate(FileFactQueryFilter filter)
    {
        if (filter.ThreeD is not null && filter.Kind != FileFactKind.ThreeD)
            throw new ArgumentException("3D conditions require 3D facts.");
        if (filter.Kind == FileFactKind.ThreeD && (filter.MinimumWidth is not null || filter.MaximumWidth is not null
            || filter.MinimumHeight is not null || filter.MaximumHeight is not null || filter.MinimumAspectRatio is not null
            || filter.MaximumAspectRatio is not null || filter.AspectRanges is not null || filter.ShortEdgeRanges is not null
            || filter.MinimumDurationMilliseconds is not null || filter.MaximumDurationMilliseconds is not null))
            throw new ArgumentException("3D cannot have dimensions or duration.");
        if (filter.ThreeD is not { } properties) return;
        if (properties.MinimumTriangleCount is < 0 or > 2_000_000_000 || properties.MaximumTriangleCount is < 0 or > 2_000_000_000
            || properties.MinimumTriangleCount > properties.MaximumTriangleCount
            || properties.Structures is { } structures && (structures.Count is < 1 or > 3 || structures.Any(value => value is not ("static" or "animated" or "rigged"))))
            throw new ArgumentException("Invalid 3D conditions.");
    }
    public static void Append(StringBuilder sql, SqliteCommand command, FileFactQueryFilter filter)
    {
        if (filter.Kind != FileFactKind.ThreeD) return;
        sql.Append(" AND EXISTS (SELECT 1 FROM file_fact_three_d_details td WHERE td.volume_id = ff.volume_id AND td.file_reference = ff.file_reference AND td.kind = 6");
        if (filter.ThreeD is { } properties)
        {
            if (properties.MinimumTriangleCount is { } min) { sql.Append(" AND td.triangle_count >= $threeDMin"); command.Parameters.AddWithValue("$threeDMin", min); }
            if (properties.MaximumTriangleCount is { } max) { sql.Append(" AND td.triangle_count <= $threeDMax"); command.Parameters.AddWithValue("$threeDMax", max); }
            if (properties.Structures is { } structures)
            {
                sql.Append(" AND (");
                for (var i = 0; i < structures.Count; i++)
                {
                    if (i > 0) sql.Append(" OR ");
                    sql.Append(structures[i] switch {
                        "static" => "(td.has_animation = 0 AND td.has_rig = 0)",
                        "animated" => "td.has_animation = 1", "rigged" => "td.has_rig = 1",
                        _ => throw new ArgumentException("Invalid 3D structure.") });
                }
                sql.Append(')');
            }
        }
        sql.Append(')');
    }
}

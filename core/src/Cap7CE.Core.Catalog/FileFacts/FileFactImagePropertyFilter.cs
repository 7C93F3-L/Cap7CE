using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactVisualConstraint(string Metric, string Operator, int Value);
// Alternatives within a group are OR; constraints in one alternative and the separate groups are AND.
public sealed record FileFactVisualGroup(IReadOnlyList<IReadOnlyList<FileFactVisualConstraint>> Alternatives);

internal static class FileFactImagePropertySql
{
    public static void Validate(FileFactQueryFilter filter)
    {
        if (filter.IsAnimated is null && filter.VisualGroups is null) return;
        if (filter.IsAnimated is not null && filter.Kind != FileFactKind.ImageDimensions)
            throw new ArgumentException("Animation conditions require image facts.");
        if (filter.VisualGroups is not null && filter.Kind is not (FileFactKind.ImageDimensions or FileFactKind.Video))
            throw new ArgumentException("Visual conditions require image or video facts.");
        if (filter.VisualGroups is not { } groups) return;
        if (groups.Count is < 1 or > 2) throw new ArgumentException("Invalid visual group count.");
        foreach (var group in groups)
        {
            if (group?.Alternatives is not { Count: >= 1 and <= 12 } alternatives) throw new ArgumentException("Invalid visual alternatives.");
            foreach (var alternative in alternatives)
            {
                if (alternative is not { Count: >= 1 and <= 8 }) throw new ArgumentException("Invalid visual constraints.");
                foreach (var constraint in alternative)
                    if (constraint is null || FileFactImageMetrics.Index(constraint.Metric) < 0
                        || constraint.Operator is not (">" or "<=") || constraint.Value is < 0 or > 10000)
                        throw new ArgumentException("Invalid visual constraint.");
            }
        }
    }

    public static void Append(StringBuilder sql, SqliteCommand command, FileFactQueryFilter filter)
    {
        if (filter.IsAnimated is null && filter.VisualGroups is null) return;
        sql.Append(" AND EXISTS (SELECT 1 FROM file_fact_image_details fd WHERE fd.volume_id = ff.volume_id AND fd.file_reference = ff.file_reference AND fd.kind = ff.kind");
        if (filter.IsAnimated is { } animated)
        {
            sql.Append(" AND fd.is_animated = $imageAnimated");
            command.Parameters.AddWithValue("$imageAnimated", animated ? 1 : 0);
        }
        if (filter.VisualGroups is { } groups)
        {
            sql.Append(" AND fd.properties_present = 1");
            for (var g = 0; g < groups.Count; g++)
            {
                sql.Append(" AND (");
                var alternatives = groups[g].Alternatives;
                for (var a = 0; a < alternatives.Count; a++)
                {
                    if (a > 0) sql.Append(" OR ");
                    sql.Append('(');
                    for (var c = 0; c < alternatives[a].Count; c++)
                    {
                        if (c > 0) sql.Append(" AND ");
                        var constraint = alternatives[a][c];
                        var index = FileFactImageMetrics.Index(constraint.Metric);
                        var parameter = $"$imageMetric{g}_{a}_{c}";
                        sql.Append("fd.").Append(FileFactImageMetrics.Column(index)).Append(' ').Append(constraint.Operator).Append(' ').Append(parameter);
                        command.Parameters.AddWithValue(parameter, constraint.Value);
                    }
                    sql.Append(')');
                }
                sql.Append(')');
            }
        }
        sql.Append(')');
    }
}

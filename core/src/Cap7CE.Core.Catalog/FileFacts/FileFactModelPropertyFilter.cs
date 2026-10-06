using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactLongRange(long? Minimum = null, long? Maximum = null);
public sealed record FileFactModelFilter(IReadOnlyList<FileFactLongRange>? ParameterRanges = null,
    IReadOnlyList<string>? Precisions = null);

internal static class FileFactModelPropertySql
{
    public static void Validate(FileFactQueryFilter filter)
    {
        if (filter.Model is not null && filter.Kind != FileFactKind.Model)
            throw new ArgumentException("Model conditions require model facts.");
        if (filter.Kind == FileFactKind.Model && (filter.MinimumWidth is not null || filter.MaximumWidth is not null
            || filter.MinimumHeight is not null || filter.MaximumHeight is not null || filter.MinimumAspectRatio is not null
            || filter.MaximumAspectRatio is not null || filter.AspectRanges is not null || filter.ShortEdgeRanges is not null
            || filter.MinimumDurationMilliseconds is not null || filter.MaximumDurationMilliseconds is not null))
            throw new ArgumentException("Model cannot have dimensions or duration.");
        if (filter.Model?.Precisions is { } precisions && (precisions.Count is < 1 or > 7 || precisions.Any(value => !FileFactModelDetails.ValidPrecision(value))))
            throw new ArgumentException("Invalid model precisions.");
        if (filter.Model?.ParameterRanges is not { } ranges) return;
        if (ranges.Count is < 1 or > 5) throw new ArgumentException("Invalid model parameter ranges.");
        foreach (var range in ranges)
            if (range is null || (range.Minimum is null && range.Maximum is null)
                || range.Minimum is < 1 or > FileFactModelDetails.MaximumParameterCount
                || range.Maximum is < 1 or > FileFactModelDetails.MaximumParameterCount || range.Minimum > range.Maximum)
                throw new ArgumentException("Invalid model parameter range.");
    }
    public static void Append(StringBuilder sql, SqliteCommand command, FileFactQueryFilter filter)
    {
        if (filter.Kind != FileFactKind.Model) return;
        sql.Append(" AND EXISTS (SELECT 1 FROM file_fact_model_details mp WHERE mp.volume_id = ff.volume_id AND mp.file_reference = ff.file_reference AND mp.kind = 4");
        if (filter.Model?.Precisions is { } precisions)
        {
            sql.Append(" AND mp.precision IN (");
            for (var i = 0; i < precisions.Count; i++)
            {
                if (i > 0) sql.Append(','); sql.Append("$modelPrecision" + i);
                command.Parameters.AddWithValue("$modelPrecision" + i, precisions[i]);
            }
            sql.Append(')');
        }
        if (filter.Model?.ParameterRanges is { } ranges)
        {
            sql.Append(" AND (");
            for (var i = 0; i < ranges.Count; i++)
            {
                if (i > 0) sql.Append(" OR "); sql.Append("(1 = 1");
                if (ranges[i].Minimum is { } min) { sql.Append($" AND mp.parameter_count >= $modelMin{i}"); command.Parameters.AddWithValue("$modelMin" + i, min); }
                if (ranges[i].Maximum is { } max) { sql.Append($" AND mp.parameter_count <= $modelMax{i}"); command.Parameters.AddWithValue("$modelMax" + i, max); }
                sql.Append(')');
            }
            sql.Append(')');
        }
        sql.Append(')');
    }
}

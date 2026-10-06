using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactFontFilter(IReadOnlyList<FileFactIntegerRange>? WeightRanges = null,
    bool? Italic = null, bool? SupportsLatin = null, bool? SupportsChinese = null, bool? Variable = null);

internal static class FileFactFontPropertySql
{
    public static void Validate(FileFactQueryFilter filter)
    {
        if (filter.Font is not null && filter.Kind != FileFactKind.Font)
            throw new ArgumentException("Font conditions require font facts.");
        if (filter.Kind == FileFactKind.Font && (filter.MinimumWidth is not null || filter.MaximumWidth is not null
            || filter.MinimumHeight is not null || filter.MaximumHeight is not null || filter.MinimumAspectRatio is not null
            || filter.MaximumAspectRatio is not null || filter.AspectRanges is not null || filter.ShortEdgeRanges is not null
            || filter.MinimumDurationMilliseconds is not null || filter.MaximumDurationMilliseconds is not null))
            throw new ArgumentException("Font cannot have dimensions or duration.");
        if (filter.Font?.WeightRanges is not { } ranges) return;
        if (ranges.Count is < 1 or > 5) throw new ArgumentException("Invalid font weight ranges.");
        foreach (var range in ranges)
            if (range is null || (range.Minimum is null && range.Maximum is null)
                || range.Minimum is < 1 or > 1000 || range.Maximum is < 1 or > 1000 || range.Minimum > range.Maximum)
                throw new ArgumentException("Invalid font weight range.");
    }

    public static void Append(StringBuilder sql, SqliteCommand command, FileFactQueryFilter filter)
    {
        if (filter.Kind != FileFactKind.Font) return;
        sql.Append(" AND EXISTS (SELECT 1 FROM file_fact_font_details fp WHERE fp.volume_id = ff.volume_id AND fp.file_reference = ff.file_reference AND fp.kind = 3");
        if (filter.Font is { } font)
        {
            foreach (var (column, value) in new[] { ("italic", font.Italic), ("supports_latin", font.SupportsLatin),
                ("supports_chinese", font.SupportsChinese), ("variable", font.Variable) })
                if (value is { } known)
                {
                    sql.Append($" AND fp.{column} = $font_{column}");
                    command.Parameters.AddWithValue("$font_" + column, known ? 1 : 0);
                }
            if (font.WeightRanges is { } ranges)
            {
                sql.Append(" AND (");
                for (var i = 0; i < ranges.Count; i++)
                {
                    if (i > 0) sql.Append(" OR ");
                    sql.Append("(1 = 1");
                    if (ranges[i].Minimum is { } min)
                    {
                        sql.Append($" AND fp.weight >= $fontMin{i}");
                        command.Parameters.AddWithValue("$fontMin" + i, min);
                    }
                    if (ranges[i].Maximum is { } max)
                    {
                        sql.Append($" AND fp.weight <= $fontMax{i}");
                        command.Parameters.AddWithValue("$fontMax" + i, max);
                    }
                    sql.Append(')');
                }
                sql.Append(')');
            }
        }
        sql.Append(')');
    }
}

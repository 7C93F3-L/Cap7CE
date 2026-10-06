using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactIntegerRange(int? Minimum = null, int? Maximum = null);
internal static class FileFactShortEdgeRangeSql
{
    public static void Validate(IReadOnlyList<FileFactIntegerRange> ranges)
    {
        if (ranges.Count is < 1 or > 16 || ranges.Any(range => range is null
            || range.Minimum is null && range.Maximum is null || range.Minimum <= 0 || range.Maximum <= 0
            || range.Minimum > range.Maximum)) throw new ArgumentException("Invalid short-edge intervals.");
    }
    public static void Append(StringBuilder sql, SqliteCommand command, IReadOnlyList<FileFactIntegerRange> ranges)
    {
        sql.Append(" AND ff.width > 0 AND ff.height > 0 AND (");
        for (var index = 0; index < ranges.Count; index++)
        {
            if (index > 0) sql.Append(" OR ");
            sql.Append('('); var range = ranges[index];
            if (range.Minimum is { } low)
            { sql.Append($"MIN(ff.width, ff.height) >= $shortEdge{index}Min"); command.Parameters.AddWithValue($"$shortEdge{index}Min", low); }
            if (range.Minimum is not null && range.Maximum is not null) sql.Append(" AND ");
            if (range.Maximum is { } high)
            { sql.Append($"MIN(ff.width, ff.height) <= $shortEdge{index}Max"); command.Parameters.AddWithValue($"$shortEdge{index}Max", high); }
            sql.Append(')');
        }
        sql.Append(')');
    }
}

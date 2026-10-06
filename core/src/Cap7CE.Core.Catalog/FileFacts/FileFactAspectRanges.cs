using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactAspectRange(FileFactRatio? Minimum = null, FileFactRatio? Maximum = null,
    bool MinimumInclusive = true, bool MaximumInclusive = true);

internal static class FileFactAspectRangeSql
{
    public static void Validate(IReadOnlyList<FileFactAspectRange> ranges)
    {
        if (ranges.Count is < 1 or > 40) throw new ArgumentException("Invalid aspect selection count.");
        foreach (var range in ranges)
        {
            if (range is null || range.Minimum is null && range.Maximum is null)
                throw new ArgumentException("Empty aspect interval.");
            foreach (var ratio in new[] { range.Minimum, range.Maximum })
                if (ratio is not null && (ratio.Numerator is < 1 or > 10_000_000 || ratio.Denominator is < 1 or > 10_000_000))
                    throw new ArgumentException("Invalid aspect endpoint.");
            if (range.Minimum is { } low && range.Maximum is { } high)
            {
                var comparison = ((long)low.Numerator * high.Denominator).CompareTo((long)high.Numerator * low.Denominator);
                if (comparison > 0 || comparison == 0 && (!range.MinimumInclusive || !range.MaximumInclusive))
                    throw new ArgumentException("Empty aspect interval.");
            }
        }
    }

    public static void Append(StringBuilder sql, SqliteCommand command, IReadOnlyList<FileFactAspectRange> ranges)
    {
        sql.Append(" AND ff.width > 0 AND ff.height > 0 AND (");
        for (var index = 0; index < ranges.Count; index++)
        {
            if (index > 0) sql.Append(" OR ");
            var range = ranges[index]; sql.Append('(');
            void Bound(FileFactRatio ratio, string suffix, string comparison)
            {
                var name = "$aspectChoice" + index + suffix;
                sql.Append($"ff.width * {name}Denominator {comparison} ff.height * {name}Numerator");
                command.Parameters.AddWithValue(name + "Numerator", ratio.Numerator);
                command.Parameters.AddWithValue(name + "Denominator", ratio.Denominator);
            }
            if (range.Minimum is { } low) Bound(low, "Min", range.MinimumInclusive ? ">=" : ">");
            if (range.Minimum is not null && range.Maximum is not null) sql.Append(" AND ");
            if (range.Maximum is { } high) Bound(high, "Max", range.MaximumInclusive ? "<=" : "<");
            sql.Append(')');
        }
        sql.Append(')');
    }
}

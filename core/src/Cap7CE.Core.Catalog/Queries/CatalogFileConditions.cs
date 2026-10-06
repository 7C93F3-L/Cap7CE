using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

public sealed record CatalogFileConditions(
    IReadOnlyList<string>? Extensions = null,
    long? MinimumSizeBytes = null,
    long? MaximumSizeBytes = null,
    long? MinimumModifiedFileTime = null,
    long? MaximumModifiedFileTime = null);

internal static class CatalogFileConditionSql
{
    public static void Validate(CatalogFileConditions conditions)
    {
        if (conditions.Extensions is { } extensions && (extensions.Count > 128
            || extensions.Any(extension => string.IsNullOrWhiteSpace(extension) || extension.Length is < 2 or > 64
                || !extension.StartsWith('.') || extension.Any(character => char.IsControl(character)
                    || char.IsWhiteSpace(character) || character is '/' or '\\'))
            || extensions.Distinct(StringComparer.OrdinalIgnoreCase).Count() != extensions.Count))
            throw new ArgumentException("Invalid extension conditions.");
        foreach (var (minimum, maximum) in new[] {
            (conditions.MinimumSizeBytes, conditions.MaximumSizeBytes),
            (conditions.MinimumModifiedFileTime, conditions.MaximumModifiedFileTime) })
            if (minimum < 0 || maximum < 0 || minimum > maximum)
                throw new ArgumentException("Invalid file condition range.");
    }

    public static void Append(StringBuilder sql, SqliteCommand command, CatalogFileConditions conditions)
    {
        // These conditions always select files, including when entry type was omitted.
        sql.Append(" AND n.is_directory = 0 ");
        if (conditions.Extensions is { Count: 0 }) sql.Append(" AND 0 ");
        else if (conditions.Extensions is { } extensions)
        {
            sql.Append(" AND n.extension COLLATE NOCASE IN (");
            for (var index = 0; index < extensions.Count; index++)
            {
                if (index > 0) sql.Append(',');
                var parameter = "$fileExtension" + index;
                sql.Append(parameter); command.Parameters.AddWithValue(parameter, extensions[index]);
            }
            sql.Append(')');
        }
        void Range(string column, string name, long? minimum, long? maximum)
        {
            if (minimum is not null) { sql.Append($" AND n.{column} >= ${name}Min"); command.Parameters.AddWithValue($"${name}Min", minimum.Value); }
            if (maximum is not null) { sql.Append($" AND n.{column} <= ${name}Max"); command.Parameters.AddWithValue($"${name}Max", maximum.Value); }
        }
        Range("size_bytes", "fileSize", conditions.MinimumSizeBytes, conditions.MaximumSizeBytes);
        Range("modified_utc_ticks", "fileModified", conditions.MinimumModifiedFileTime, conditions.MaximumModifiedFileTime);
    }
}

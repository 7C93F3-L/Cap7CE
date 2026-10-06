using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactTextDataFilter(string FactKind, long? MinimumCharacterCount = null, long? MaximumCharacterCount = null,
    long? MinimumLineCount = null, long? MaximumLineCount = null, long? MinimumRecordCount = null, long? MaximumRecordCount = null,
    long? MinimumColumnCount = null, long? MaximumColumnCount = null, string? JsonRootKind = null);

internal static class FileFactTextDataPropertySql
{
    public static void Validate(FileFactQueryFilter filter)
    {
        if (filter.TextData is not null && filter.Kind != FileFactKind.TextData)
            throw new ArgumentException("Text/data conditions require text/data facts.");
        if (filter.Kind == FileFactKind.TextData && (filter.MinimumWidth is not null || filter.MaximumWidth is not null
            || filter.MinimumHeight is not null || filter.MaximumHeight is not null || filter.MinimumAspectRatio is not null
            || filter.MaximumAspectRatio is not null || filter.AspectRanges is not null || filter.ShortEdgeRanges is not null
            || filter.MinimumDurationMilliseconds is not null || filter.MaximumDurationMilliseconds is not null))
            throw new ArgumentException("Text/data cannot have dimensions or duration.");
        if (filter.TextData is not { } properties) return;
        (long? Min, long? Max)[] ranges = [(properties.MinimumCharacterCount, properties.MaximumCharacterCount),
            (properties.MinimumLineCount, properties.MaximumLineCount), (properties.MinimumRecordCount, properties.MaximumRecordCount),
            (properties.MinimumColumnCount, properties.MaximumColumnCount)];
        if (ranges.Any(range => range.Min is < 0 or > 1_000_000_000 || range.Max is < 0 or > 1_000_000_000 || range.Min > range.Max))
            throw new ArgumentException("Invalid text/data count range.");
        var valid = properties.FactKind switch
        {
            "text" => ranges[2] == (null, null) && ranges[3] == (null, null) && properties.JsonRootKind is null,
            "csv" => ranges[0] == (null, null) && ranges[1] == (null, null) && properties.JsonRootKind is null,
            "json" => ranges[0] == (null, null) && ranges[1] == (null, null) && ranges[3] == (null, null)
                && properties.JsonRootKind is null or "array" or "object",
            _ => false
        };
        if (!valid) throw new ArgumentException("Invalid text/data subkind conditions.");
    }
    public static void Append(StringBuilder sql, SqliteCommand command, FileFactQueryFilter filter)
    {
        if (filter.Kind != FileFactKind.TextData) return;
        sql.Append(" AND EXISTS (SELECT 1 FROM file_fact_text_data_details td WHERE td.volume_id=ff.volume_id AND td.file_reference=ff.file_reference AND td.kind=7");
        if (filter.TextData is { } properties)
        {
            sql.Append(" AND td.fact_kind=$textDataKind"); command.Parameters.AddWithValue("$textDataKind", properties.FactKind);
            AppendRange(sql, command, "character_count", "Characters", properties.MinimumCharacterCount, properties.MaximumCharacterCount);
            AppendRange(sql, command, "line_count", "Lines", properties.MinimumLineCount, properties.MaximumLineCount);
            AppendRange(sql, command, "record_count", "Records", properties.MinimumRecordCount, properties.MaximumRecordCount);
            AppendRange(sql, command, "column_count", "Columns", properties.MinimumColumnCount, properties.MaximumColumnCount);
            if (properties.JsonRootKind is { } root) { sql.Append(" AND td.json_root_kind=$textDataRoot"); command.Parameters.AddWithValue("$textDataRoot", root); }
        }
        sql.Append(')');
    }
    private static void AppendRange(StringBuilder sql, SqliteCommand command, string column, string parameter, long? min, long? max)
    {
        if (min is not null) { sql.Append($" AND td.{column} >= $textData{parameter}Min"); command.Parameters.AddWithValue($"$textData{parameter}Min", min); }
        if (max is not null) { sql.Append($" AND td.{column} <= $textData{parameter}Max"); command.Parameters.AddWithValue($"$textData{parameter}Max", max); }
    }
}

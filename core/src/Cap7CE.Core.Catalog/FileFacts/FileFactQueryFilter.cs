using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactRatio(int Numerator, int Denominator);
public sealed record FileFactQueryFilter(
    FileFactKind Kind,
    int ExtractorVersion,
    int? MinimumWidth = null,
    int? MaximumWidth = null,
    int? MinimumHeight = null,
    int? MaximumHeight = null,
    long? MinimumDurationMilliseconds = null,
    long? MaximumDurationMilliseconds = null,
    FileFactRatio? MinimumAspectRatio = null,
    FileFactRatio? MaximumAspectRatio = null,
    IReadOnlyList<FileFactAspectRange>? AspectRanges = null,
    IReadOnlyList<FileFactIntegerRange>? ShortEdgeRanges = null,
    bool? IsAnimated = null,
    IReadOnlyList<FileFactVisualGroup>? VisualGroups = null,
    IReadOnlyList<FileFactIntegerRange>? ChannelRanges = null,
    FileFactFontFilter? Font = null,
    FileFactModelFilter? Model = null,
    FileFactDocumentFilter? Document = null,
    FileFactThreeDFilter? ThreeD = null,
    FileFactTextDataFilter? TextData = null,
    FileFactArchiveFilter? Archive = null);

internal static class FileFactQuerySql
{
    internal enum Plan { Automatic, FactFirst, NameFirst }

    public static async Task<Plan> ChoosePlanAsync(CatalogV2Query query, SqliteConnection connection,
        SqliteTransaction transaction, CancellationToken token)
    {
        if (query.Facts is null || query.Scope.Kind != CatalogQueryScopeKind.AllVolumes) return Plan.Automatic;
        if (!string.IsNullOrWhiteSpace(query.Query)) return Plan.Automatic;
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        var sql = new StringBuilder("""
            SELECT COUNT(*) FROM (SELECT 1 FROM file_facts ff
            LEFT JOIN file_fact_volumes fv ON fv.volume_id = ff.volume_id
            LEFT JOIN file_fact_sources fs ON fs.volume_id = ff.volume_id AND fs.file_reference = ff.file_reference
            WHERE ff.volume_epoch = COALESCE(fv.epoch, 0) AND ff.content_revision = COALESCE(fs.content_revision, 0)
            """);
        AppendScalarPredicate(sql, command, query.Facts);
        if (query.VolumeIds.Count > 0)
        {
            sql.Append(" AND ff.volume_id IN (");
            for (var index = 0; index < query.VolumeIds.Count; index++)
            {
                if (index > 0) sql.Append(',');
                sql.Append("$candidateVolume").Append(index);
                command.Parameters.AddWithValue("$candidateVolume" + index, query.VolumeIds[index]);
            }
            sql.Append(')');
        }
        // A bounded estimate avoids counting the whole fact index on each keyset page.
        sql.Append(" LIMIT 50001);");
        command.CommandText = sql.ToString();
        var candidates = Convert.ToInt32(await command.ExecuteScalarAsync(token));
        return candidates <= 10_000 ? Plan.FactFirst : candidates <= 50_000 ? Plan.Automatic : Plan.NameFirst;
    }

    public static void AppendSource(StringBuilder sql, Plan plan, bool entries = false, bool scopedEntries = false)
    {
        if (entries) {
            var source = scopedEntries ? "scoped_entries" : "query_entries";
            sql.Append(plan == Plan.FactFirst
                ? $" FROM file_facts ff CROSS JOIN {source} n ON n.volume_id=ff.volume_id AND n.file_reference=ff.file_reference JOIN catalog_volumes_v2 v ON v.volume_id=n.volume_id "
                : $" FROM {source} n JOIN catalog_volumes_v2 v ON v.volume_id=n.volume_id ");
            if (plan == Plan.NameFirst) sql.Append(" CROSS JOIN file_facts ff ON ff.volume_id=n.volume_id AND ff.file_reference=n.file_reference ");
            return;
        }
        sql.Append(' ');
        sql.Append(plan switch
        {
            Plan.FactFirst => """
                FROM file_facts ff CROSS JOIN catalog_nodes_v2 n
                    ON n.volume_id = ff.volume_id AND n.file_reference = ff.file_reference
                JOIN catalog_volumes_v2 v ON v.volume_id = n.volume_id
                """,
            Plan.NameFirst => """
                FROM catalog_nodes_v2 n INDEXED BY catalog_nodes_v2_name
                CROSS JOIN catalog_volumes_v2 v ON v.volume_id = n.volume_id
                CROSS JOIN file_facts ff ON ff.volume_id = n.volume_id AND ff.file_reference = n.file_reference
                """,
            _ => "FROM catalog_nodes_v2 n JOIN catalog_volumes_v2 v ON v.volume_id = n.volume_id"
        });
    }
    public static void Validate(FileFactQueryFilter filter)
    {
        FileFactImagePropertySql.Validate(filter);
        FileFactAudioPropertySql.Validate(filter);
        FileFactFontPropertySql.Validate(filter);
        FileFactModelPropertySql.Validate(filter);
        FileFactDocumentPropertySql.Validate(filter);
        FileFactThreeDPropertySql.Validate(filter);
        FileFactTextDataPropertySql.Validate(filter);
        FileFactArchivePropertySql.Validate(filter);
        if (filter.AspectRanges is not null) FileFactAspectRangeSql.Validate(filter.AspectRanges);
        if (filter.ShortEdgeRanges is not null) FileFactShortEdgeRangeSql.Validate(filter.ShortEdgeRanges);
        if (!Enum.IsDefined(filter.Kind) || filter.ExtractorVersion <= 0
            || filter.MinimumWidth <= 0 || filter.MaximumWidth <= 0
            || filter.MinimumHeight <= 0 || filter.MaximumHeight <= 0
            || filter.MinimumWidth > filter.MaximumWidth || filter.MinimumHeight > filter.MaximumHeight
            || filter.MinimumDurationMilliseconds < 0 || filter.MaximumDurationMilliseconds < 0
            || filter.MinimumDurationMilliseconds > filter.MaximumDurationMilliseconds
            || (filter.Kind == FileFactKind.ImageDimensions
                && (filter.MinimumDurationMilliseconds is not null || filter.MaximumDurationMilliseconds is not null)))
            throw new ArgumentException("Invalid fact query filter.");
        foreach (var ratio in new[] { filter.MinimumAspectRatio, filter.MaximumAspectRatio })
            if (ratio is not null && (ratio.Numerator is < 1 or > 1_000_000 || ratio.Denominator is < 1 or > 1_000_000))
                throw new ArgumentException("Invalid aspect ratio.");
        if (filter.MinimumAspectRatio is { } minimum && filter.MaximumAspectRatio is { } maximum
            && (long)minimum.Numerator * maximum.Denominator > (long)maximum.Numerator * minimum.Denominator)
            throw new ArgumentException("Aspect ratio range is reversed.");
    }

    public static void AppendJoin(StringBuilder sql, Plan plan)
    {
        if (plan == Plan.Automatic)
            sql.Append(" JOIN file_facts ff ON ff.volume_id = n.volume_id AND ff.file_reference = n.file_reference ");
        sql.Append("""
             LEFT JOIN file_fact_sources fs ON fs.volume_id = n.volume_id AND fs.file_reference = n.file_reference
             LEFT JOIN file_fact_volumes fv ON fv.volume_id = n.volume_id
            """);
    }

    public static void AppendPredicate(StringBuilder sql, SqliteCommand command, FileFactQueryFilter filter)
    {
        sql.Append("""
             AND n.is_directory = 0 AND (n.attributes & 0x00441400) = 0 AND v.state = 'ready'
             AND ff.size_bytes = n.size_bytes AND ff.modified_file_time = n.modified_utc_ticks
             AND ff.volume_epoch = COALESCE(fv.epoch, 0) AND ff.content_revision = COALESCE(fs.content_revision, 0)
            """);
        AppendScalarPredicate(sql, command, filter);
    }

    private static void AppendScalarPredicate(StringBuilder sql, SqliteCommand command, FileFactQueryFilter filter)
    {
        // Version 3 only adds search evidence; version 2 visual scalars/metrics remain compatible.
        sql.Append(filter.ExtractorVersion == 3 && filter.Kind is FileFactKind.ImageDimensions or FileFactKind.Video
            ? " AND ff.kind = $factKind AND ff.extractor_version IN (2, $factExtractor) AND ff.state = 0 "
            : " AND ff.kind = $factKind AND ff.extractor_version = $factExtractor AND ff.state = 0 ");
        if (filter.Kind == FileFactKind.ImageDimensions) sql.Append(" AND ff.width IS NOT NULL ");
        command.Parameters.AddWithValue("$factKind", (int)filter.Kind);
        command.Parameters.AddWithValue("$factExtractor", filter.ExtractorVersion);
        void Range(string column, string parameter, long? minimum, long? maximum)
        {
            if (minimum is not null)
            {
                sql.Append($" AND ff.{column} >= ${parameter}Min");
                command.Parameters.AddWithValue("$" + parameter + "Min", minimum.Value);
            }
            if (maximum is not null)
            {
                sql.Append($" AND ff.{column} <= ${parameter}Max");
                command.Parameters.AddWithValue("$" + parameter + "Max", maximum.Value);
            }
        }
        Range("width", "width", filter.MinimumWidth, filter.MaximumWidth);
        Range("height", "height", filter.MinimumHeight, filter.MaximumHeight);
        Range("duration_ms", "duration", filter.MinimumDurationMilliseconds, filter.MaximumDurationMilliseconds);
        if (filter.AspectRanges is not null) FileFactAspectRangeSql.Append(sql, command, filter.AspectRanges);
        if (filter.ShortEdgeRanges is not null) FileFactShortEdgeRangeSql.Append(sql, command, filter.ShortEdgeRanges);
        FileFactImagePropertySql.Append(sql, command, filter);
        FileFactAudioPropertySql.Append(sql, command, filter);
        FileFactFontPropertySql.Append(sql, command, filter);
        FileFactModelPropertySql.Append(sql, command, filter);
        FileFactDocumentPropertySql.Append(sql, command, filter);
        FileFactThreeDPropertySql.Append(sql, command, filter);
        FileFactTextDataPropertySql.Append(sql, command, filter);
        FileFactArchivePropertySql.Append(sql, command, filter);
        if (filter.MinimumAspectRatio is { } min)
        {
            sql.Append(" AND ff.width * $ratioMinDenominator >= ff.height * $ratioMinNumerator");
            command.Parameters.AddWithValue("$ratioMinDenominator", min.Denominator);
            command.Parameters.AddWithValue("$ratioMinNumerator", min.Numerator);
        }
        if (filter.MaximumAspectRatio is { } max)
        {
            sql.Append(" AND ff.width * $ratioMaxDenominator <= ff.height * $ratioMaxNumerator");
            command.Parameters.AddWithValue("$ratioMaxDenominator", max.Denominator);
            command.Parameters.AddWithValue("$ratioMaxNumerator", max.Numerator);
        }
    }
}

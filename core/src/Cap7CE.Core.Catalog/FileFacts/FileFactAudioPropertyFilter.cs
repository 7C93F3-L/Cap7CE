using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

internal static class FileFactAudioPropertySql
{
    public static void Validate(FileFactQueryFilter filter)
    {
        if (filter.Kind == FileFactKind.Audio && (filter.MinimumWidth is not null || filter.MaximumWidth is not null
            || filter.MinimumHeight is not null || filter.MaximumHeight is not null || filter.MinimumAspectRatio is not null
            || filter.MaximumAspectRatio is not null || filter.AspectRanges is not null || filter.ShortEdgeRanges is not null))
            throw new ArgumentException("Audio cannot have visual dimensions.");
        if (filter.ChannelRanges is not { } ranges) return;
        if (filter.Kind != FileFactKind.Audio || ranges.Count is < 1 or > 3)
            throw new ArgumentException("Invalid audio channels.");
        foreach (var range in ranges)
            if (range is null || (range.Minimum is null && range.Maximum is null) || range.Minimum <= 0
                || range.Maximum <= 0 || range.Minimum > range.Maximum)
                throw new ArgumentException("Invalid channel range.");
    }

    public static void Append(StringBuilder sql, SqliteCommand command, FileFactQueryFilter filter)
    {
        if (filter.ChannelRanges is not { } ranges) return;
        sql.Append(" AND EXISTS (SELECT 1 FROM file_fact_audio_details ad WHERE ad.volume_id = ff.volume_id AND ad.file_reference = ff.file_reference AND ad.kind = 2 AND (");
        for (var i = 0; i < ranges.Count; i++)
        {
            if (i > 0) sql.Append(" OR ");
            sql.Append("(1 = 1");
            if (ranges[i].Minimum is { } min)
            {
                sql.Append($" AND ad.channel_count >= $channelMin{i}");
                command.Parameters.AddWithValue("$channelMin" + i, min);
            }
            if (ranges[i].Maximum is { } max)
            {
                sql.Append($" AND ad.channel_count <= $channelMax{i}");
                command.Parameters.AddWithValue("$channelMax" + i, max);
            }
            sql.Append(')');
        }
        sql.Append("))");
    }
}

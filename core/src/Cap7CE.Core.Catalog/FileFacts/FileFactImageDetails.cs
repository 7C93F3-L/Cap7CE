using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

// Fixed 0..10000 metrics shared by extraction and query predicates. No opaque JSON in the hot query path.
public static class FileFactImageMetrics
{
    private static readonly string[] scalar = ["transparentRatio", "semitransparentRatio", "borderTransparentRatio",
        "brightnessMean", "brightnessMedian", "darkRatio", "highlightRatio", "saturationMean", "highSaturationRatio",
        "lowSaturationRatio", "borderWhiteRatio", "borderBlackRatio", "borderUniformity"];
    private static readonly string[] colors = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"];
    public static IReadOnlyList<string> Names { get; } = Array.AsReadOnly(scalar.Concat(
        colors.Select(color => "colorRatio." + color)).Concat(colors.Select(color => "colorBlockRatio." + color)).ToArray());
    private static readonly IReadOnlyDictionary<string, int> indices = Names.Select((name, index) => (name, index))
        .ToDictionary(item => item.name, item => item.index, StringComparer.Ordinal);
    internal static int Index(string? name) => name is not null && indices.TryGetValue(name, out var index) ? index : -1;

    public static void Validate(IReadOnlyDictionary<string, int>? properties)
    {
        if (properties is null) return;
        if (properties.Count != Names.Count || Names.Any(name => !properties.TryGetValue(name, out var value) || value is < 0 or > 10000))
            throw new ArgumentException("Invalid image property vector.");
    }
    internal static string Column(int index) => "metric_" + index;
}

internal static class FileFactImageDetails
{
    public static string CreateTableSql()
    {
        var sql = new StringBuilder("""
            CREATE TABLE file_fact_image_details (
                volume_id TEXT NOT NULL, file_reference TEXT NOT NULL,
                kind INTEGER NOT NULL CHECK(kind IN (0,1)),
                is_animated INTEGER NULL CHECK(is_animated IN (0,1)),
                properties_present INTEGER NOT NULL CHECK(properties_present IN (0,1)),
            """);
        for (var i = 0; i < FileFactImageMetrics.Names.Count; i++)
            sql.Append($"{FileFactImageMetrics.Column(i)} INTEGER NULL CHECK({FileFactImageMetrics.Column(i)} BETWEEN 0 AND 10000),");
        for (var i = 0; i < FileFactImageMetrics.Names.Count; i++)
            sql.Append($"CHECK(({FileFactImageMetrics.Column(i)} IS NOT NULL) = properties_present),");
        return sql.Append("""
                CHECK(kind = 0 OR is_animated IS NULL),
                PRIMARY KEY(volume_id, file_reference, kind),
                FOREIGN KEY(volume_id, file_reference, kind) REFERENCES file_facts(volume_id, file_reference, kind) ON DELETE CASCADE
            ) STRICT, WITHOUT ROWID;
            """).ToString();
    }

    public static async Task PublishAsync(SqliteConnection connection, SqliteTransaction transaction,
        FileFactObservation observation, CancellationToken token)
    {
        if (observation.Kind is not (FileFactKind.ImageDimensions or FileFactKind.Video)) return;
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, observation.Identity);
        command.Parameters.AddWithValue("$kind", (int)observation.Kind);
        command.CommandText = "DELETE FROM file_fact_image_details WHERE volume_id = $volume AND file_reference = $reference AND kind = $kind;";
        await command.ExecuteNonQueryAsync(token);
        if (observation.IsAnimated is null && observation.VisualProperties is null) return;
        var values = string.Join(',', Enumerable.Range(0, FileFactImageMetrics.Names.Count).Select(index => "$metric" + index));
        command.CommandText = $"INSERT INTO file_fact_image_details VALUES($volume, $reference, $kind, $animated, $present, {values});";
        command.Parameters.AddWithValue("$animated", observation.IsAnimated is { } animated ? (object)(animated ? 1 : 0) : DBNull.Value);
        command.Parameters.AddWithValue("$present", observation.VisualProperties is null ? 0 : 1);
        for (var i = 0; i < FileFactImageMetrics.Names.Count; i++)
            command.Parameters.AddWithValue("$metric" + i, observation.VisualProperties is { } properties
                ? properties[FileFactImageMetrics.Names[i]] : DBNull.Value);
        await command.ExecuteNonQueryAsync(token);
    }

    public static async Task<(bool? IsAnimated, IReadOnlyDictionary<string, int>? Properties)> ReadAsync(
        SqliteConnection connection, SqliteTransaction transaction, CatalogEntryIdentity identity, FileFactKind kind, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        FileFactDatabase.BindIdentity(command, identity);
        command.Parameters.AddWithValue("$kind", (int)kind);
        var columns = string.Join(',', Enumerable.Range(0, FileFactImageMetrics.Names.Count).Select(FileFactImageMetrics.Column));
        command.CommandText = $"SELECT is_animated, properties_present, {columns} FROM file_fact_image_details WHERE volume_id = $volume AND file_reference = $reference AND kind = $kind;";
        using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token)) return (null, null);
        Dictionary<string, int>? properties = null;
        if (reader.GetInt32(1) == 1)
        {
            properties = new(StringComparer.Ordinal);
            for (var i = 0; i < FileFactImageMetrics.Names.Count; i++) properties.Add(FileFactImageMetrics.Names[i], reader.GetInt32(i + 2));
        }
        return (reader.IsDBNull(0) ? null : reader.GetInt32(0) == 1, properties);
    }
}

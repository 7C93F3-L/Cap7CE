using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Protocol;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Cap7CE.Core.Host.MetadataWorkers;

internal sealed record NodeMetadataResponse(long Id, long ResidentBytes, JsonElement Result)
{
    public FileFactExtractionResult ReadResult(long expectedId, FileFactKind kind)
    {
        try { return Parse(expectedId, kind); }
        catch (Exception error) when (error is InvalidOperationException or ArgumentException) { throw new JsonException(); }
    }
    private FileFactExtractionResult Parse(long expectedId, FileFactKind kind)
    {
        if (Id != expectedId || ResidentBytes < 0 || ResidentBytes > 9_007_199_254_740_991 || Result.ValueKind != JsonValueKind.Object)
            throw new JsonException();
        var node = JsonNode.Parse(Result.GetRawText())!.AsObject();
        var state = node["state"]?.GetValue<string>() switch {
            "indexed" => FileFactState.Indexed, "unsupported" => FileFactState.Unsupported, "failed" => FileFactState.Failed,
            _ => throw new JsonException()
        };
        if (state != FileFactState.Indexed && (node.Count != 2 || node["errorCode"] is null)) throw new JsonException();
        node["state"] = (int)state;
        var result = node.Deserialize<FileFactExtractionResult>(CoreProtocolJson.Options) ?? throw new JsonException();
        if (state != FileFactState.Indexed) {
            if (result.ErrorCode is not { Length: > 0 and <= 96 } code || code.Any(c => !(c is >= 'a' and <= 'z' or >= '0' and <= '9' or '-')))
                throw new JsonException();
            return result;
        }
        var allowed = kind switch {
            FileFactKind.ImageDimensions => new[] { "state", "width", "height", "isAnimated", "visualProperties", "searchEvidence" },
            FileFactKind.Video => ["state", "width", "height", "durationMilliseconds", "visualProperties", "searchEvidence"],
            FileFactKind.Audio => ["state", "durationMilliseconds", "channelCount"],
            FileFactKind.Font => ["state", "fontProperties"], FileFactKind.Model => ["state", "modelProperties"],
            FileFactKind.Document => ["state", "documentProperties"], FileFactKind.ThreeD => ["state", "threeDProperties"],
            FileFactKind.TextData => ["state", "textDataProperties"], FileFactKind.Archive => ["state", "archiveProperties"],
            _ => throw new JsonException()
        };
        if (node.Any(pair => !allowed.Contains(pair.Key, StringComparer.Ordinal))) throw new JsonException();
        if (kind is FileFactKind.ImageDimensions or FileFactKind.Video && (result.Width is not > 0 || result.Height is not > 0)
            || kind is FileFactKind.Audio or FileFactKind.Video && result.DurationMilliseconds is not > 0
            || kind == FileFactKind.Audio && result.ChannelCount is not > 0) throw new JsonException();
        return result; // Broker/database additionally validate all kind-specific scalar/detail bounds before publication.
    }
}

using System.Text.Json;

namespace Cap7CE.Core.Reader.Host;

internal sealed record ReaderProbeResult(
    string Status,
    string Stage,
    bool FixtureOnly,
    bool RestrictedServiceToken,
    bool RemoteClientsRejected,
    bool ClientTokenChecked,
    bool ServerProcessIdBound,
    bool SourceVolumeMetadataRead,
    bool SourceFilesRead,
    bool NetworkUsed)
{
    public static async Task WriteAsync(
        ReaderServiceConfig config,
        ReaderProbeResult result)
    {
        var pendingPath = Path.Combine(ReaderHostConstants.DataDirectory, "result.pending.json");
        await File.WriteAllTextAsync(pendingPath, JsonSerializer.Serialize(result));
        File.Move(pendingPath, config.ResultPath, true);
    }
}

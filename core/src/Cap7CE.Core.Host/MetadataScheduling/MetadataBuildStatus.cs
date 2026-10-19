using Cap7CE.Core.Catalog.FileFacts;
using System.Text.Json.Serialization;

namespace Cap7CE.Core.Host.MetadataScheduling;

public sealed record MetadataBuildVolume(string VolumeId, string Label);
public sealed record MetadataBuildScope(string VolumeId, string? RootFileReference, string Label);
public sealed record MetadataDirectoryTask(string Path, int Pending);
public sealed record MetadataBuildStatus(MetadataBuildProgress Progress, IReadOnlyList<MetadataBuildVolume> Volumes,
    FileFactQueuePolicy? Policy, IReadOnlyDictionary<string, string> ScopeLabels,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] MetadataDirectoryTask? DirectoryTask = null);
public sealed record MetadataDirectoryBuildRequest(string Path, bool AllowMetadataExtraction);

internal static class MetadataBuildPolicyCopy
{
    internal static FileFactQueuePolicy Copy(FileFactQueuePolicy policy) => policy with {
        VolumeOrder = policy.VolumeOrder.ToArray(), Includes = policy.Includes.ToArray(), Excludes = policy.Excludes.ToArray()
    };
}

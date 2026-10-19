using Cap7CE.Core.Host.MetadataBuild;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.MetadataScheduling;

public sealed partial class MetadataBuildCoordinator
{
    public async Task<MetadataBuildStatus> StartDirectoryAsync(MetadataDirectoryBuildRequest request, CancellationToken token = default)
    {
        long own; lock (gate) { own = directoryRevision; actionRevision++; }
        await LoadAsync(); lock (gate) if (closing || !request.AllowMetadataExtraction) throw Error("metadata-build-confirmation-required");
        var path = MetadataDirectoryPath.Normalize(request.Path); bool exists; lock (gate) exists = queue.Contains(path);
        if (!exists) { Task writing;
            lock (gate) if (queue.Count >= 32) throw Error("metadata-directory-queue-full");
            var baseline = await global.ReadAsync(token); var resolved = await catalog.ResolveScopeAsync(new(path), token);
            lock (gate) {
                if (own != directoryRevision || closing) throw Error("metadata-build-start-cancelled");
                if (resolved.VolumeId is not null && !baseline.Volumes.Any(volume => volume.VolumeId == resolved.VolumeId)) throw Error("metadata-directory-unavailable");
                if (queue.Contains(path)) return SnapshotResult(baseline);
                if (queue.Count >= 32) throw Error("metadata-directory-queue-full");
                var job = new MetadataDirectoryJob(path, resolved.Resolved && resolved.VolumeId is not null ? new(resolved.VolumeId, resolved.RootFileReference) : null);
                if (queue.Count == 0) { queue.Intent = "active"; current = new(path); progress = new("preparing"); } queue.Add(job); writing = SaveAsync();
            }
            await writing;
        }
        Kick(); return await ReadAsync(token);
    }
    public async Task<MetadataBuildStatus> StartAllVolumesAsync(bool allowMetadataExtraction, CancellationToken token = default)
    {
        long own; lock (gate) { own = directoryRevision; actionRevision++; }
        await LoadAsync(); lock (gate) if (closing || !allowMetadataExtraction) throw Error("metadata-build-confirmation-required");
        var catalogStatus = await catalog.ReadStatusAsync(token);
        var volumes = catalogStatus.Volumes.Where(volume => volume.Selected && (volume.Queryable || volume.State is "building" or "discovering" or "catchingUp")).ToArray();
        if (volumes.Length == 0 || volumes.Any(volume => !System.Text.RegularExpressions.Regex.IsMatch(volume.DisplayName, "^[A-Za-z]:[\\\\/]?$"))) throw Error("metadata-directory-unavailable");
        Task? writing = null;
        lock (gate) {
            if (own != directoryRevision || closing) throw Error("metadata-build-start-cancelled");
            var jobs = volumes.Select(volume => new MetadataDirectoryJob(volume.DisplayName[..2].ToUpperInvariant() + "\\", new(volume.VolumeId))).Where(job => !queue.Contains(job.Path)).ToArray();
            if (queue.Count + jobs.Length > 32) throw Error("metadata-directory-queue-full");
            if (jobs.Length > 0) { if (queue.Count == 0) { queue.Intent = "active"; current = jobs[0]; progress = new("preparing"); } foreach (var job in jobs) queue.Add(job); writing = SaveAsync(); }
        }
        if (writing is not null) await writing; Kick(); return await ReadAsync(token);
    }
    private MetadataBuildStatus SnapshotResult(MetadataBuildStatus baseline) => current is null ? baseline : baseline with { Progress = progress, DirectoryTask = new(current.Path, queue.Count) };
}

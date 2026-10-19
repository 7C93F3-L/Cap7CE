namespace Cap7CE.Core.Protocol;

public static class MetadataBuildOperations
{
    public const string Attach = "metadata.build.attach", Status = "metadata.build.status", ResolveScope = "metadata.build.resolveScope",
        SavePolicy = "metadata.build.savePolicy", Start = "metadata.build.start", Pause = "metadata.build.pause", Resume = "metadata.build.resume",
        StartDirectory = "metadata.build.startDirectory", StartAllVolumes = "metadata.build.startAllVolumes", CancelDirectories = "metadata.build.cancelDirectories",
        Restore = "metadata.build.restore", Notify = "metadata.build.notify", Shutdown = "metadata.build.shutdown";
    public static readonly IReadOnlyList<string> All = [Attach, Status, ResolveScope, SavePolicy, Start, Pause, Resume, StartDirectory, StartAllVolumes, CancelDirectories, Restore, Notify, Shutdown];
    public static bool IsControl(string operation) => operation is Pause or CancelDirectories or Shutdown;
}

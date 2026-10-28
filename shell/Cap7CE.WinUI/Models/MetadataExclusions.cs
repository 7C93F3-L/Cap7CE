namespace Cap7CE.WinUI.Models;

internal sealed record MetadataExclusion(string Key,string Label,string Path,bool Enabled,bool BuiltIn);
internal sealed record MetadataBatchVolume(string VolumeId,string Drive);
internal sealed record MetadataBatchScope(string VolumeId,string? RootFileReference);
internal sealed record MetadataBatchPolicy(string[] VolumeOrder,MetadataBatchScope[] Includes,MetadataBatchScope[] Excludes);

internal static class MetadataExclusions
{
    public static MetadataExclusion[] Defaults(IReadOnlyDictionary<string,bool> choices)
    {
        (string Id,string Label,string Path)[] folders=[
            ("windows","Windows",Environment.GetFolderPath(Environment.SpecialFolder.Windows)),
            ("program-files","Program Files",Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)),
            ("program-files-x86","Program Files (x86)",Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86)),
            ("appdata","AppData",Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),"AppData")),
            ("program-data","ProgramData",Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData))];
        return folders.Select(item=>new MetadataExclusion(item.Id,item.Label,item.Path,!choices.TryGetValue(item.Id,out var enabled)||enabled,true)).ToArray();
    }
    public static string CustomKey(string path)=>"custom:"+Path.GetFullPath(path).TrimEnd('\\','/').ToUpperInvariant();
    public static async Task<MetadataBatchPolicy> BuildAsync(IReadOnlyList<MetadataBatchVolume> volumes,IReadOnlyList<MetadataExclusion> choices,
        Func<string,CancellationToken,Task<MetadataBatchScope>> resolve,CancellationToken token=default)
    {
        if(volumes.Count==0)throw new Localization.UiFailure("ui.error.metadataVolumes");
        var excluded=new HashSet<MetadataBatchScope>();
        foreach(var item in choices.Where(item=>item.Enabled)) {
            token.ThrowIfCancellationRequested();
            var volume=volumes.FirstOrDefault(volume=>item.Path.StartsWith(volume.Drive.TrimEnd('\\','/')+"\\",StringComparison.OrdinalIgnoreCase));
            if(volume is null)continue;
            var scope=await resolve(item.Path,token);
            if(scope.VolumeId!=volume.VolumeId||string.IsNullOrEmpty(scope.RootFileReference))throw new Localization.UiFailure("ui.error.metadataExclusion",new Dictionary<string,object?>{{"path",item.Path}});
            excluded.Add(scope);
        }
        token.ThrowIfCancellationRequested();
        return new(volumes.Select(v=>v.VolumeId).ToArray(),volumes.Select(v=>new MetadataBatchScope(v.VolumeId,null)).ToArray(),excluded.ToArray());
    }
}

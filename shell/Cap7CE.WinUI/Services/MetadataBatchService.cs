using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

internal static class MetadataBatchService
{
    public static async Task StartAsync(ShellServices services,IReadOnlyList<MetadataExclusion> exclusions,CancellationToken token=default)
    {
        await services.RefreshVolumesAsync();token.ThrowIfCancellationRequested();
        var owner=services.Core;
        var order=services.Preferences.Current.IndexVolumeOrder;
        var volumes=services.Volumes.Where(v=>v.Selected&&v.Queryable).OrderBy(v=>Array.IndexOf(order,v.VolumeId) is var index&&index>=0?index:int.MaxValue)
            .Select(v=>new MetadataBatchVolume(v.VolumeId,v.DisplayName)).ToArray();
        var existing=new List<MetadataExclusion>();
        foreach(var item in exclusions.Where(item=>item.Enabled)) {
            if(item.BuiltIn&&string.IsNullOrEmpty(item.Path))continue;
            if(!volumes.Any(volume=>item.Path.StartsWith(volume.Drive.TrimEnd('\\','/')+"\\",StringComparison.OrdinalIgnoreCase)))continue;
            try {
                if(!File.GetAttributes(item.Path).HasFlag(FileAttributes.Directory))throw new UiFailure("ui.error.exclusionDirectory",new Dictionary<string,object?>{{"path",item.Path}});
                existing.Add(item);
            }catch(FileNotFoundException)when(item.BuiltIn){}catch(DirectoryNotFoundException)when(item.BuiltIn){}
        }
        var policy=await MetadataExclusions.BuildAsync(volumes,existing,async(path,abort)=>{
            if(!ReferenceEquals(owner,services.Core))throw new UiFailure("ui.error.batchConnection");
            FileAccessGuard.RejectLinks(path);
            var scope=await services.Metadata.InvokeAsync("resolveScope",new{path},abort);
            return new(scope.GetProperty("volumeId").GetString()!,scope.GetProperty("rootFileReference").GetString());
        },token);
        if(!ReferenceEquals(owner,services.Core))throw new UiFailure("ui.error.batchConnection");
        await services.Metadata.InvokeAsync("start",new{policy,allowMetadataExtraction=true},token);
    }
}

using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Services;

namespace Cap7CE.WinUI.Models;

internal static class HomeEntries
{
    // Shell identities/names and redirected paths are a single source of truth.
    // This projection never depends on Catalog availability or starts indexing.
    public static IEnumerable<AssetItem> Create()
    {
        foreach(var folder in SystemLocations.Current.Folders)
            yield return new(new BasicSearchItem(folder.Id,folder.Name,"","",IsDirectory:true),folder.Path!);
        foreach(var drive in DriveInfo.GetDrives()) {
            var root=ReadyRoot(drive);
            if(root is not null)yield return new(new BasicSearchItem("drive-"+root,DrivePresentation.Read(root).Name,"","",IsDirectory:true),root);
        }
    }
    private static string? ReadyRoot(DriveInfo drive)
    {try{return drive.IsReady?drive.Name:null;}catch(IOException){return null;}}
}

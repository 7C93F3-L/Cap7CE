namespace Cap7CE.WinUI.Services;

internal sealed record CoreSetupDrive(string Name,DriveType Type,bool Ready,string Format);

internal static class CoreSetupVolumes
{
    public static string[] Read()
    {
        var drives=new List<CoreSetupDrive>();
        foreach(var drive in DriveInfo.GetDrives())try {
            if(drive.DriveType==DriveType.Fixed&&drive.IsReady)
                drives.Add(new(drive.Name,drive.DriveType,true,drive.DriveFormat));
        }catch(IOException){}catch(UnauthorizedAccessException){}
        return Select(drives);
    }
    public static string[] Select(IEnumerable<CoreSetupDrive> drives)=>drives
        .Where(d=>d.Type==DriveType.Fixed&&d.Ready&&d.Format.Equals("NTFS",StringComparison.OrdinalIgnoreCase)
            &&d.Name.Length==3&&d.Name[1]==':'&&d.Name[2]=='\\'&&char.ToUpperInvariant(d.Name[0]) is >= 'A' and <= 'Z')
        .Select(d=>char.ToUpperInvariant(d.Name[0]).ToString()).Distinct().Order().ToArray();
    public static string[] Arguments(bool repair,string[] volumes)
    {
        if(volumes.Length==0)throw new InvalidOperationException("setup-no-fixed-ntfs-volumes");
        return ["--activation-coordinator","--action",repair?"repair":"enable","--catalog","preserve","--volumes",string.Join(',',volumes)];
    }
}

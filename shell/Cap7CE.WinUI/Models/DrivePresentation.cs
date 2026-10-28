namespace Cap7CE.WinUI.Models;

internal sealed record DrivePresentation(string Name,string Capacity,bool IsSystem,bool UsesDefaultName=false,bool CapacityAvailable=true)
{
    public static DrivePresentation Read(string path)
    {
        var root=Path.GetPathRoot(path)??path;
        if(root.Length==2&&root[1]==':')root+="\\";
        var letter=root.TrimEnd('\\');
        var system=string.Equals(root,Path.GetPathRoot(Environment.SystemDirectory),StringComparison.OrdinalIgnoreCase);
        var name=Services.SystemLocations.ReadDriveName(root);
        try
        {
            var drive=new DriveInfo(root);var label=drive.VolumeLabel;
            var size=(double)drive.TotalSize;var unit="GB";size/=1024d*1024*1024;
            if(size>=1024){size/=1024;unit="TB";}
            return new(name??(string.IsNullOrWhiteSpace(label)?letter:$"{label} ({letter})"),$"{size:0.#} {unit}",system,name is null&&string.IsNullOrWhiteSpace(label));
        }
        catch(Exception error) when(error is IOException or UnauthorizedAccessException or ArgumentException)
        {return new(name??letter,"—",system,name is null,false);}
    }
}

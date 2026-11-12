using System.Text.Json.Serialization;
namespace Cap7CE.WinUI.DesktopActions;
internal sealed record DesktopProgram(string Name,string Path)
{
    public const string AppsPrefix="shell:AppsFolder\\";
    public string? AppId {get;init;}
    public string? ExecutablePath {get;init;}
    [JsonIgnore] public bool Registered=>!string.IsNullOrWhiteSpace(AppId)&&string.Equals(Path,AppsPrefix+AppId,StringComparison.Ordinal);
    [JsonIgnore] public string WindowPath=>Registered||System.IO.Path.GetExtension(Path).Equals(".lnk",StringComparison.OrdinalIgnoreCase)?ExecutablePath??"":Path;
    public bool SameEntry(DesktopProgram other)=>string.Equals(Path,other.Path,StringComparison.OrdinalIgnoreCase)
        ||(!Registered||!other.Registered)&&WindowPath.Length>0&&string.Equals(WindowPath,other.WindowPath,StringComparison.OrdinalIgnoreCase);
}

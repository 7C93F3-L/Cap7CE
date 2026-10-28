namespace Cap7CE.WinUI.Models;

internal sealed record SystemLocation(string Id,string Name,string? Path);

// Display/path snapshot only. Stable identities never depend on localized names.
internal sealed class SystemLocationSnapshot(IEnumerable<SystemLocation> locations)
{
    public IReadOnlyList<SystemLocation> Locations {get;}=Array.AsReadOnly(locations.ToArray());
    public SystemLocation? Computer=>Locations.FirstOrDefault(location=>location.Id=="computer");
    public IEnumerable<SystemLocation> Folders=>Locations.Where(location=>location.Path is {Length:>0});
    public string? NameForPath(string path)=>Folders.FirstOrDefault(location=>string.Equals(
        location.Path!.TrimEnd('\\','/'),path.TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase))?.Name;
}

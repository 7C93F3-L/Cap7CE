using Microsoft.UI.Xaml.Data;

namespace Cap7CE.WinUI.Models;

[Bindable]
public sealed class ArchivePreviewEntry
{
    public string FullPath {get;}
    public string Name {get;}
    public string Location {get;}
    public string Glyph {get;}
    public string SizeLabel {get;}
    public string? LocationResourceKey {get;}
    public string? SizeResourceKey {get;}
    internal ArchivePreviewEntry(string path,bool directory,string sizeLabel)
    {
        FullPath=path;var normalized=path.Replace('\\','/').TrimEnd('/');var separator=normalized.LastIndexOf('/');
        Name=separator<0?normalized:normalized[(separator+1)..];
        Location=separator<0?"":normalized[..separator];LocationResourceKey=separator<0?"ui.preview.archiveRoot":null;
        Glyph=AssetItem.EntryGlyph(directory);SizeLabel=directory?"":sizeLabel;SizeResourceKey=directory?"main.folder":null;
    }
}

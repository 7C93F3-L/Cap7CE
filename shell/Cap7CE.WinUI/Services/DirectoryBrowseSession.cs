using System.Text.Json;
using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

// Reuses the bounded filesystem owner and cursor contract, with optional recursive pages.
internal sealed class DirectoryBrowseSession(VisualConnection visuals) : IDisposable
{
    private readonly string id=Guid.NewGuid().ToString();
    private string root="";
    private bool closed;
    private bool recursive;
    public async Task<DirectoryBrowsePage> StartAsync(string path,string sort,bool showHidden,bool includeSubfolders,CancellationToken token)
    {
        FileAccessGuard.RejectLinks(path);root=Path.GetFullPath(path);
        recursive=includeSubfolders;
        var value=await visuals.RequestAsync("directoryBrowse.start",id,root,new{sort,excludeHidden=!showHidden,includeSubfolders});
        token.ThrowIfCancellationRequested();return Read(value);
    }
    public async Task<DirectoryBrowsePage> NextAsync(string cursor,CancellationToken token)
    {
        var value=await visuals.RequestAsync("directoryBrowse.next",id,cursor);
        token.ThrowIfCancellationRequested();return Read(value);
    }
    private DirectoryBrowsePage Read(JsonElement value)
    {
        ObjectDisposedException.ThrowIf(closed,this);
        var entries=new List<AssetItem>();
        foreach(var item in value.GetProperty("entries").EnumerateArray())
        {
            var path=Path.GetFullPath(item.GetProperty("path").GetString()!);
            if(!path.StartsWith(root.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase)
                ||!recursive&&!string.Equals(Path.GetDirectoryName(path)?.TrimEnd('\\'),root.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))throw new IOException("目录浏览结果越界");
            long? modified=item.TryGetProperty("modifiedAt",out var date)&&date.ValueKind==JsonValueKind.String
                &&DateTimeOffset.TryParse(date.GetString(),out var parsed)?parsed.UtcDateTime.ToFileTimeUtc():null;
            var entry=new BasicSearchItem(path,item.GetProperty("name").GetString()!,Path.GetFileName(path),
                item.GetProperty("extension").GetString()!,item.GetProperty("kind").GetString()=="folder",
                SizeBytes:item.TryGetProperty("size",out var size)&&size.ValueKind==JsonValueKind.Number&&size.TryGetInt64(out var bytes)?bytes:null,ModifiedUtcTicks:modified);
            entries.Add(new(entry,path));
        }
        return new(entries,value.GetProperty("nextCursor").GetString());
    }
    public void Dispose(){if(closed)return;closed=true;_=CancelAsync();}
    private async Task CancelAsync(){try{await visuals.RequestAsync("directoryBrowse.cancel",id);}catch{}}
}
internal sealed record DirectoryBrowsePage(IReadOnlyList<AssetItem> Items,string? NextCursor);

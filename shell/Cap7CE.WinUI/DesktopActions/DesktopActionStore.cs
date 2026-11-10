using System.Text.Json;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
namespace Cap7CE.WinUI.DesktopActions;
internal sealed record DesktopProgram(string Name,string Path);
internal sealed record DesktopSearch(string Query,string Path,bool Favorite,string EntryPath,BrowseFilter Filter,bool Recursive);
internal sealed record DesktopActionOptions
{
    public bool Enabled {get;init;}
    public double Size {get;init;}=32;
    public int X {get;init;}=int.MinValue;
    public int Y {get;init;}=int.MinValue;
    public bool Vertical {get;init;}=true;
    public bool RecordHistory {get;init;}=true;
    public int HistoryCount {get;init;}=5;
    public DesktopProgram[] Programs {get;init;}=[];
    public DesktopSearch[] History {get;init;}=[];
}
// Only this owner reads/writes the independent desktop-actions settings file.
internal sealed class DesktopActionStore
{
    private readonly string path;
    private readonly SemaphoreSlim gate=new(1);
    public DesktopActionOptions Current {get;private set;}=new();
    public event Action? Changed;
    public DesktopActionStore():this(Path.Combine(PreferenceStore.DataRoot,"desktop-actions.json")){}
    internal DesktopActionStore(string path)=>this.path=path;
    public async Task LoadAsync()
    {
        if(File.Exists(path))Current=JsonSerializer.Deserialize<DesktopActionOptions>(await File.ReadAllTextAsync(path),FramedRpc.Json)??new();
        Current=Current with{Vertical=Current.X==int.MinValue||Current.Y==int.MinValue||Current.Vertical,
            Size=double.IsFinite(Current.Size)?Math.Clamp(Current.Size,24,48):32,HistoryCount=Math.Clamp(Current.HistoryCount,1,20),
            Programs=(Current.Programs??[]).Where(p=>!string.IsNullOrWhiteSpace(p.Path)&&!string.IsNullOrWhiteSpace(p.Name)).Take(30).ToArray(),
            History=(Current.History??[]).Where(h=>!string.IsNullOrWhiteSpace(h.Query)&&h.Filter is not null).Take(50).ToArray()};
        Changed?.Invoke();
    }
    public async Task UpdateAsync(Func<DesktopActionOptions,DesktopActionOptions> update)
    {
        await gate.WaitAsync();var temp=path+"."+Guid.NewGuid().ToString("N")+".tmp";
        try{var next=update(Current);Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllTextAsync(temp,JsonSerializer.Serialize(next,FramedRpc.Json));File.Move(temp,path,true);Current=next;Changed?.Invoke();}
        finally{if(File.Exists(temp))File.Delete(temp);gate.Release();}
    }
    public Task RememberAsync(DesktopSearch item)=>UpdateAsync(v=>!v.RecordHistory?v:v with{History=new[]{item}.Concat(v.History.Where(h=>
        h.Query!=item.Query||!string.Equals(h.Path,item.Path,StringComparison.OrdinalIgnoreCase)||h.Favorite!=item.Favorite)).Take(50).ToArray()});
    public Task ResetCapsuleAsync()
    {
        var defaults=new DesktopActionOptions();
        return UpdateAsync(v=>v with{Size=defaults.Size,X=defaults.X,Y=defaults.Y,Vertical=defaults.Vertical});
    }
    public Task ClearHistoryAsync()=>UpdateAsync(value=>value with{History=[]});
}

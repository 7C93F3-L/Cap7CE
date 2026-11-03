using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;

// Isolate the real BrowseSession from WinUI, processes and the user's Catalog.
namespace Cap7CE.WinUI.Models
{
    internal sealed record AssetItem(BasicSearchItem Entry,string FullPath,string? DisplayName=null);
    internal sealed class AssetCollection : List<AssetItem>
    {
        public bool HasMoreItems {get;set;}
        public long? TotalCount {get;set;}
        public Func<Task<uint>>? LoadPage {get;set;}
    }
    internal sealed record BrowseFilter
    {
        public int Count {get;init;}
        public CoreSearchFactFilter? Facts=>null;
        public CoreSearchFileConditions? ToConditions()=>null;
    }
    internal static class HomeEntries {public static AssetItem[] Create()=>[];}
}
namespace Cap7CE.WinUI.Services
{
    internal static class SystemLocations
    {
        internal sealed record Place(string Name);
        internal sealed class Snapshot {public Place? Computer=>new("This PC");public string? NameForPath(string path)=>null;}
        public static Snapshot Current {get;}=new();
    }
    internal sealed class PreferenceStore
    {
        public static string DataRoot=>throw new Exception("Tests must not write diagnostics");
        public ShellPreferences Current {get;set;}=new();
        public Task UpdateAsync(Func<ShellPreferences,ShellPreferences> update){Current=update(Current);return Task.CompletedTask;}
    }
    internal sealed class ShellServices
    {
        public CoreConnection? Core {get;set;}
        public PreferenceStore Preferences {get;}=new();
        public VisualConnection Visuals {get;}=new();
        public DeletedPathTracker DeletedPaths {get;set;}=new(_=>false);
        public IReadOnlyList<CoreVolumeStatus> Volumes {get;}=[new("v","E:","NTFS",true,"ready",0,0,true,false)];
        public Func<Task>? Connecting {get;set;}
        public int Connections {get;private set;}
        public TaskNotifications TaskNotices {get;}=new();
        public Task RefreshVolumesAsync()=>Task.CompletedTask;
        public async Task ConnectAsync(bool onlyIfDisconnected=false){Connections++;if(Connecting is {} connect)await connect();}
    }
    internal sealed class CoreConnection
    {
        public bool IsConnected {get;set;}=true;
        public bool Queryable {get;set;}=true;
        public CatalogStatusResponse IndexStatus {get;set;}=new([],[],0);
        public Queue<CatalogStatusResponse> IndexSnapshots {get;}=new();
        public CoreVolumeStatus[] IndexVolumes {get;set;}=[];
        public List<(string Operation,object Body)> Requests {get;}=[];
        public TaskCompletionSource? Resolving {get;set;}
        public bool Supports(string operation)=>true;
        public async Task<T> RequestAsync<T>(string operation,object body,CancellationToken token=default,int deadlineMs=15000)
        {
            Requests.Add((operation,body));
            object result;
            if(operation==CoreOperations.CatalogStatus)result=IndexSnapshots.Count>0?IndexSnapshots.Dequeue():IndexStatus;
            else if(operation==CoreOperations.VolumeList)result=new VolumeListResponse(IndexVolumes);
            else if(operation==CoreOperations.VolumeSelection)result=new VolumeSelectionResponse(((VolumeSelectionRequest)body).VolumeIds);
            else if(operation is CoreOperations.CatalogBuild or CoreOperations.CatalogRebuild)result=new CatalogBuildResponse("fixture-build",true);
            else if(operation==CoreOperations.CatalogResolveScope){if(Resolving is {} wait)await wait.Task.WaitAsync(token);result=new CatalogResolveScopeResponse(Queryable,"v","5","E:","ready",Queryable,"5");}
            else result=new SearchPageResponse([new("file","file.txt","file.txt",".txt",false,"v")],operation==CoreOperations.SearchStart?"next":null,operation!=CoreOperations.SearchStart,1);
            token.ThrowIfCancellationRequested();return (T)result;
        }
    }
    internal sealed class TaskNotifications
    {
        public List<(string Kind,string Id)> Started {get;}=[];
        public void Begin(string kind,string id)=>Started.Add((kind,id));
    }
    internal sealed class VisualConnection {public List<(string Path,bool Recursive)> Reads {get;}=[];public IReadOnlyList<AssetItem> Items {get;set;}=[];}
    internal sealed class DirectoryBrowseSession(VisualConnection visuals) : IDisposable
    {
        public Task<DirectoryBrowsePage> StartAsync(string path,string sort,bool hidden,bool recursive,CancellationToken token)
        {token.ThrowIfCancellationRequested();visuals.Reads.Add((path,recursive));return Task.FromResult(new DirectoryBrowsePage(visuals.Items,null,visuals.Items.Count));}
        public Task<DirectoryBrowsePage> NextAsync(string cursor,CancellationToken token)=>throw new Exception("Unexpected filesystem continuation");
        public void Dispose(){}
    }
    internal sealed record DirectoryBrowsePage(IReadOnlyList<AssetItem> Items,string? NextCursor,long? TotalCount);
    internal static class FileAccessGuard {public static void RejectLinks(string path){}}
    internal static class NativeDiagnostics {public static void CoreFailure(string text){}}
}
namespace Cap7CE.WinUI.Localization
{
    // Unknown-provider presentation is outside these routing tests. Known failures use real resource classes.
    internal static class MaintenanceText {public static string Error(string code,LanguageSession language)=>code;}
}

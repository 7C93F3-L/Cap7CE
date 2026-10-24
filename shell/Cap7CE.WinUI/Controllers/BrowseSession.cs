using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;

namespace Cap7CE.WinUI.Controllers;
internal sealed class BrowseSession(ShellServices services) : IDisposable
{
    public string Title { get; set; } = "此电脑";
    public string PathValue { get; private set; } = "";
    public string Query { get; set; } = "";
    public BrowseFilter Filter { get; set; } = new();
    public bool Recursive { get; set; } = WorkspaceOptions.Read(services.Preferences.Current,WorkspacePreferenceScope.Computer).Recursive;
    public bool ShowHidden { get; set; } = WorkspaceOptions.Read(services.Preferences.Current,WorkspacePreferenceScope.Computer).ShowHidden;
    public string Sort { get; set; } = WorkspaceOptions.Read(services.Preferences.Current,WorkspacePreferenceScope.Computer).Sort;
    public WorkspacePreferenceScope PreferenceScope {get;private set;}
    public long AddressRevision {get;private set;}
    public bool Random { get; set; }
    public uint Seed { get; set; } = (uint)System.Random.Shared.Next();
    public bool Busy { get; private set; }
    public bool PreserveSelection {get;private set;}
    public bool Invalidated {get;private set;}
    public void Invalidate()=>Invalidated=true;
    public string? Error {get;private set;}
    public AssetCollection Items { get; private set; } = new();
    public event Action? Changed;
    private readonly Stack<WorkspaceLocation> back = new(), forward = new();
    private WorkspaceLocation? pendingOrigin;
    private CancellationTokenSource query = new();
    private int generation;
    private DirectoryBrowseSession? filesystem;
    public bool FilesystemBrowsing {get;private set;}
    public bool UsesCatalogResults=>BrowseScopeRules.UsesCatalogResults(FilesystemBrowsing,PathValue,Query,Filter.Count>0,Random);
    public Task<bool> OpenLocationAsync(string path,bool favorite)
    {EnterScope(favorite?WorkspacePreferenceScope.Favorites:WorkspacePreferenceScope.Computer);return NavigateAsync(path);}
    private void EnterScope(WorkspacePreferenceScope scope)
    {
        pendingOrigin??=new(PathValue,PreferenceScope);PreferenceScope=scope;AddressRevision++;
        Random=false;Query="";Filter=new();SyncWorkspaceOptions();
    }
    public bool SyncWorkspaceOptions()
    {
        var value=WorkspaceOptions.Read(services.Preferences.Current,PreferenceScope);
        var changed=Recursive!=value.Recursive||ShowHidden!=value.ShowHidden||Sort!=value.Sort;
        Recursive=value.Recursive;ShowHidden=value.ShowHidden;Sort=value.Sort;return changed;
    }
    public bool CanBack => back.Count > 0;
    public bool CanForward => forward.Count > 0;
    public async Task BackAsync()
    {
        if(!back.TryPeek(out var target))return;var current=new WorkspaceLocation(PathValue,PreferenceScope);EnterScope(target.Scope);
        if(await NavigateAsync(target.Path,false)){back.Pop();forward.Push(current);Changed?.Invoke();}
    }
    public async Task ForwardAsync()
    {
        if(!forward.TryPeek(out var target))return;var current=new WorkspaceLocation(PathValue,PreferenceScope);EnterScope(target.Scope);
        if(await NavigateAsync(target.Path,false)){forward.Pop();back.Push(current);Changed?.Invoke();}
    }
    public Task UpAsync()
    {if(PathValue.Length==0)return Task.CompletedTask;Query="";return NavigateAsync(Directory.GetParent(PathValue)?.FullName??"");}
    public async Task<bool> NavigateAsync(string path, bool remember = true,bool preserveSelection=false)
    {
        if(path.Trim().Length==0&&pendingOrigin is null&&(PreferenceScope!=WorkspacePreferenceScope.Computer||PathValue.Length>0))EnterScope(WorkspacePreferenceScope.Computer);
        var origin=pendingOrigin??new(PathValue,PreferenceScope);pendingOrigin=null;SyncWorkspaceOptions();
        PreserveSelection=preserveSelection;
        Invalidated=false;var version = ++generation; Items.HasMoreItems = false;
        query.Cancel(); query.Dispose(); query = new(); var token = query.Token;
        filesystem?.Dispose();filesystem=null;
        Busy = true;Error=null;Changed?.Invoke();
        try
        {
            path = path.Trim(); if (path.Length > 0) path = Path.GetFullPath(path);
            var plainBrowse = string.IsNullOrWhiteSpace(Query) && Filter.Count == 0 && !Random;
            // Ordinary browsing is always a fresh filesystem listing, even when
            // the Catalog is queryable. Index recovery must not hide new files.
            if(path.Length>0&&plainBrowse)
                return await BrowseFilesystemAsync(path,remember,version,token,origin);
            // “此电脑” and ordinary directory browsing are shell capabilities. They
            // must remain usable while the optional catalog host is reconnecting.
            if (services.Core is null)
            {
                if (path.Length == 0 && plainBrowse)
                {
                    var home = new AssetCollection();
                    foreach (var item in HomeEntries.Create()) home.Add(item);
                    Remember(path,remember,origin);
                    PathValue = path; Title = "此电脑"; Items = home; FilesystemBrowsing = false;
                    return true;
                }
                throw new IOException("搜索和筛选需要连接 Core；请在设置中重新连接后再试");
            }
            CoreSearchScopeRequest? scope = null;
            var volumes = services.Volumes.Where(v => v.Queryable).Select(v => v.VolumeId).ToArray();
            if (path.Length > 0)
            {
                FileAccessGuard.RejectLinks(path);
                var resolved = await services.Core.RequestAsync<CatalogResolveScopeResponse>(CoreOperations.CatalogResolveScope, new CatalogResolveScopeRequest(path), token);
                if (!resolved.Resolved || !resolved.Queryable || resolved.DirectoryFileReference is null)
                {
                    throw new IOException("此目录的索引尚未就绪，可清除搜索和筛选后直接浏览；搜索及筛选需要可查询的索引");
                }
                volumes = [resolved.VolumeId!]; scope = new(BrowseScopeRules.DirectoryScope(Query, Recursive, Filter.Count > 0), resolved.VolumeId, resolved.DirectoryFileReference);
            }
            var result = new AssetCollection(); string? cursor = null;
            if (path.Length == 0 && string.IsNullOrWhiteSpace(Query) && Filter.Count == 0 && !Random)
            {
                foreach (var item in HomeEntries.Create()) result.Add(item);
            }
            else
            {
                if (volumes.Length == 0) throw new IOException("没有可查询的磁盘；此入口不会自动建库");
                var request = new SearchStartRequest(Query.Trim(), 100, Sort, volumes, scope,
                    EntryType: BrowseScopeRules.EntryType(Query,Recursive,Filter.Count>0),
                    TextTarget: "name-path-or-keywords", Facts: Filter.Facts, FileConditions: Filter.ToConditions(), ExcludeHidden: !ShowHidden, RandomSeed: Random ? Seed : null, IncludeTotalCount: true,
                    Continuation: services.Core.Supports(CoreOperations.SearchLive)?"live":null);
                var page = await services.Core.RequestAsync<SearchPageResponse>(CoreOperations.SearchStart, request, token);
                if (version != generation) return false;
                Append(result, page); cursor = page.NextCursor; result.HasMoreItems = cursor is not null;
            }
            while(preserveSelection&&result.Count<Items.Count&&cursor is not null) {
                var continuation=await services.Core.RequestAsync<SearchPageResponse>(CoreOperations.SearchNextPage,new SearchNextPageRequest(cursor),token);
                if(version!=generation)return false;Append(result,continuation);cursor=continuation.NextCursor;
            }
            if(preserveSelection) {
                var previous=Items.ToDictionary(item=>item.FullPath,StringComparer.OrdinalIgnoreCase);
                for(var i=0;i<result.Count;i++)if(previous.TryGetValue(result[i].FullPath,out var old)&&Equals(old.Entry,result[i].Entry))result[i]=old;
                if(result.Count==Items.Count&&result.Zip(Items).All(pair=>ReferenceEquals(pair.First,pair.Second))){Items.TotalCount=result.TotalCount;result=Items;}
                result.HasMoreItems=cursor is not null;
            }
            if (version != generation) return false;
            Remember(path,remember,origin);
            PathValue = path; Title = path.Length == 0 ? "此电脑" : System.IO.Path.GetFileName(path.TrimEnd('\\'));
            var loading = false;
            result.LoadPage = async () => {
                if (loading || !result.HasMoreItems || version != generation) return 0;
                loading = true;
                try
                {
                    var page = await services.Core.RequestAsync<SearchPageResponse>(CoreOperations.SearchNextPage, new SearchNextPageRequest(cursor!), token);
                    if (version != generation) return 0;
                    Append(result, page); cursor = page.NextCursor; result.HasMoreItems = cursor is not null;
                    Changed?.Invoke();
                    return (uint)page.Items.Count;
                }
                catch (OperationCanceledException) { return 0; }
                catch (Exception error) { if(version==generation){result.HasMoreItems = false; Error = error.Message==CoreErrorCodes.InvalidCursor?"后续结果暂时无法加载，请点击刷新后继续浏览。":error.Message + "；请刷新"; Changed?.Invoke();} return 0; }
                finally { loading = false; }
            };
            Items = result;FilesystemBrowsing=false;
            return true;
        }
        catch (OperationCanceledException) { return false; }
        catch (Exception error) { if (version == generation) Error = error.Message; return false; }
        finally { if (version == generation) { Busy = false; Changed?.Invoke(); } }
    }
    private void Append(AssetCollection target, SearchPageResponse page)
    {
        if(page.TotalCount is { } total)target.TotalCount=total;
        foreach (var item in page.Items)
        {
            var volume = services.Volumes.First(v => v.VolumeId == item.VolumeId); var root = volume.DisplayName.TrimEnd('\\') + "\\";
            var full = Path.GetFullPath(Path.Combine(root, item.RelativePath.TrimStart('\\', '/')));
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new IOException("结果路径越界");
            if (!IsDeleted(full)) target.Add(new(item, full));else if(target.TotalCount is { } count)target.TotalCount=Math.Max(0,count-1);
        }
    }
    private void Remember(string path,bool remember,WorkspaceLocation origin)
    {if(remember&&(path!=origin.Path||PreferenceScope!=origin.Scope)){back.Push(origin);forward.Clear();}}
    private async Task<bool> BrowseFilesystemAsync(string path,bool remember,int version,CancellationToken token,WorkspaceLocation origin)
    {
        var owner=new DirectoryBrowseSession(services.Visuals);filesystem=owner;
        var page=await owner.StartAsync(path,Sort,ShowHidden,Recursive,token);
        if(version!=generation)return false;
        var result=new AssetCollection{TotalCount=page.TotalCount};foreach(var item in page.Items)if(!IsDeleted(item.FullPath))result.Add(item);else if(result.TotalCount is { } count)result.TotalCount=Math.Max(0,count-1);
        var cursor=page.NextCursor;result.HasMoreItems=cursor is not null;var loading=false;
        result.LoadPage=async()=>{
            if(loading||!result.HasMoreItems||version!=generation)return 0;loading=true;
            try{
                var next=await owner.NextAsync(cursor!,token);if(version!=generation)return 0;
                foreach(var item in next.Items)if(!IsDeleted(item.FullPath))result.Add(item);else if(result.TotalCount is { } count)result.TotalCount=Math.Max(0,count-1);
                cursor=next.NextCursor;result.HasMoreItems=cursor is not null;Changed?.Invoke();return (uint)next.Items.Count;
            }catch(OperationCanceledException){return 0;}
            catch(Exception error){if(version==generation){result.HasMoreItems=false;Error=error.Message+"；请刷新";Changed?.Invoke();}return 0;}
            finally{loading=false;}
        };
        Remember(path,remember,origin);
        PathValue=path;Title=System.IO.Path.GetFileName(path.TrimEnd('\\'));Items=result;FilesystemBrowsing=true;return true;
    }
    private bool IsDeleted(string path) => services.DeletedPaths.Any(deleted => path.Equals(deleted, StringComparison.OrdinalIgnoreCase)
        || path.StartsWith(deleted.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase));
    public void RemoveDeleted()
    {
        for (var i = Items.Count - 1; i >= 0; i--) if (IsDeleted(Items[i].FullPath)){Items.RemoveAt(i);if(Items.TotalCount is { } count)Items.TotalCount=Math.Max(0,count-1);}
        Changed?.Invoke();
    }
    public void Dispose() { ++generation; query.Cancel(); query.Dispose();filesystem?.Dispose(); Items.HasMoreItems = false; }
}

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
    public bool Recursive { get; set; } = services.Preferences.Current.Recursive;
    public bool ShowHidden { get; set; } = services.Preferences.Current.ShowHidden;
    public string Sort { get; set; } = services.Preferences.Current.Sort;
    public bool Random { get; set; }
    public uint Seed { get; set; } = (uint)System.Random.Shared.Next();
    public bool Busy { get; private set; }
    public string? Error {get;private set;}
    public AssetCollection Items { get; private set; } = new();
    public event Action? Changed;
    private readonly Stack<string> back = new(), forward = new();
    private CancellationTokenSource query = new();
    private int generation;
    public bool CanBack => back.Count > 0;
    public bool CanForward => forward.Count > 0;
    public async Task BackAsync() { if (back.TryPop(out var target)) { forward.Push(PathValue); await NavigateAsync(target, false); } }
    public async Task ForwardAsync() { if (forward.TryPop(out var target)) { back.Push(PathValue); await NavigateAsync(target, false); } }
    public Task UpAsync() => NavigateAsync(PathValue.Length > 0 ? Directory.GetParent(PathValue)?.FullName ?? "" : "");
    public async Task NavigateAsync(string path, bool remember = true)
    {
        var version = ++generation; Items.HasMoreItems = false;
        query.Cancel(); query.Dispose(); query = new(); var token = query.Token;
        Busy = true;Error=null;Changed?.Invoke();
        try
        {
            path = path.Trim(); if (path.Length > 0) path = Path.GetFullPath(path);
            if (services.Core is null) throw new IOException("Core 未连接，请在设置中重新连接");
            CoreSearchScopeRequest? scope = null;
            var volumes = services.Volumes.Where(v => v.Queryable).Select(v => v.VolumeId).ToArray();
            if (path.Length > 0)
            {
                FileAccessGuard.RejectLinks(path);
                var resolved = await services.Core.RequestAsync<CatalogResolveScopeResponse>(CoreOperations.CatalogResolveScope, new CatalogResolveScopeRequest(path), token);
                if (!resolved.Resolved || !resolved.Queryable || resolved.DirectoryFileReference is null) throw new IOException("目录不在可查询 Catalog 中；此入口不会自动建库");
                volumes = [resolved.VolumeId!]; scope = new(Query.Trim().Length > 0 || Recursive ? "directory-descendants" : "direct-children", resolved.VolumeId, resolved.DirectoryFileReference);
            }
            var result = new AssetCollection(); string? cursor = null;
            if (path.Length == 0 && string.IsNullOrWhiteSpace(Query) && Filter.Count == 0 && !Random)
            {
                foreach (var item in HomeEntries.Create(services.Volumes)) result.Add(item);
            }
            else
            {
                if (volumes.Length == 0) throw new IOException("没有可查询的磁盘；此入口不会自动建库");
                var request = new SearchStartRequest(Query.Trim(), 100, Sort, volumes, scope,
                    EntryType: Filter.Count > 0 || Recursive && Query.Trim().Length == 0 ? "file" : "any",
                    TextTarget: "name-path-or-keywords", Facts: Filter.Facts, FileConditions: Filter.ToConditions(), ExcludeHidden: !ShowHidden, RandomSeed: Random ? Seed : null);
                var page = await services.Core.RequestAsync<SearchPageResponse>(CoreOperations.SearchStart, request, token);
                if (version != generation) return;
                Append(result, page); cursor = page.NextCursor; result.HasMoreItems = cursor is not null;
            }
            if (version != generation) return;
            if (remember && path != PathValue) { back.Push(PathValue); forward.Clear(); }
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
                catch (Exception error) { result.HasMoreItems = false; Error = error.Message + "；请刷新"; Changed?.Invoke(); return 0; }
                finally { loading = false; }
            };
            Items = result;
        }
        catch (OperationCanceledException) { }
        catch (Exception error) { if (version == generation) Error = error.Message; }
        finally { if (version == generation) { Busy = false; Changed?.Invoke(); } }
    }
    private void Append(AssetCollection target, SearchPageResponse page)
    {
        foreach (var item in page.Items)
        {
            var volume = services.Volumes.First(v => v.VolumeId == item.VolumeId); var root = volume.DisplayName.TrimEnd('\\') + "\\";
            var full = Path.GetFullPath(Path.Combine(root, item.RelativePath.TrimStart('\\', '/')));
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new IOException("结果路径越界");
            if (!IsDeleted(full)) target.Add(new(item, full));
        }
    }
    private bool IsDeleted(string path) => services.DeletedPaths.Any(deleted => path.Equals(deleted, StringComparison.OrdinalIgnoreCase)
        || path.StartsWith(deleted.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase));
    public void RemoveDeleted()
    {
        for (var i = Items.Count - 1; i >= 0; i--) if (IsDeleted(Items[i].FullPath)) Items.RemoveAt(i);
        Changed?.Invoke();
    }
    public void Dispose() { ++generation; query.Cancel(); query.Dispose(); Items.HasMoreItems = false; }
}

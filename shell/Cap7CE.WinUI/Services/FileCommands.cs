using Cap7CE.WinUI.Localization;
using System.Diagnostics;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml.Controls;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage;

namespace Cap7CE.WinUI.Services;
internal sealed class FileCommands(ShellServices services, Func<XamlRoot> xamlRoot, Action<UiMessage> notice,nint window=0)
{
    private readonly SemaphoreSlim operation = new(1);
    public event Action<AssetItem,uint?>? PreviewRequested;
    public event Action<string>? NavigateRequested;
    public event Action? BeforeMutation;
    public event Action? AfterMutation;
    public void ToggleFavorite(IReadOnlyList<AssetItem> items)
    {if(items is [var item]&&item.Entry.IsDirectory)Run(()=>services.Favorites.ToggleAsync(item.FullPath));}
    public event Action? ItemsDeleted;
    public event Action<UiMessage?>? DeleteStatusChanged;
    public event Action<IReadOnlyList<AssetItem>>? AutoKeywordsRequested;
    public void AutoKeywords(IReadOnlyList<AssetItem> items)
    {if(items.Count is 0 or >100000)throw new UiFailure("ui.error.fileSelection");if(items.Count==1)FileAccessGuard.Validate(items[0]);AutoKeywordsRequested?.Invoke(items.ToArray());}
    public void AutoKeywords(string directory)=>AutoKeywords([new AssetItem(new Cap7CE.Core.Protocol.BasicSearchItem(directory,Path.GetFileName(directory.TrimEnd('\\')),"","",true),directory)]);
    public Task StartMetadataAsync(AssetItem item)
    {FileAccessGuard.Validate(item);if(!item.Entry.IsDirectory)throw new UiFailure("ui.error.metadataDirectory");return StartMetadataAsync(item.FullPath);}
    public async Task StartMetadataAsync(string directory)
    {
        FileAccessGuard.RejectLinks(directory);
        if(!Directory.Exists(directory))throw new UiDirectoryFailure("ui.error.directoryMissing");
        await services.Metadata.InvokeAsync("startDirectory",new{path=Path.GetFullPath(directory),allowMetadataExtraction=true});
    }
    public void Run(Func<Task> action) => Execute(action);
    private async void Execute(Func<Task> action) { try { await action(); } catch (Exception error) { notice(FailureText.From(error)); } }
    public void Preview(AssetItem item,uint? spacePressedAt=null) { FileAccessGuard.Validate(item); PreviewRequested?.Invoke(item,spacePressedAt); }
    public void Open(AssetItem item)
    {
        FileAccessGuard.Validate(item);
        if (item.Entry.IsDirectory) NavigateRequested?.Invoke(item.FullPath);
        else {
            var start=new ProcessStartInfo(item.FullPath){UseShellExecute=true};
            if(Path.GetExtension(item.FullPath).ToLowerInvariant() is ".bat" or ".cmd")start.WorkingDirectory=Path.GetDirectoryName(item.FullPath)!;
            Process.Start(start);
        }
    }
    public void Reveal(AssetItem item)
    {
        FileAccessGuard.Validate(item);
        var info = new ProcessStartInfo("explorer.exe") { UseShellExecute = true, Arguments = $"/select,\"{item.FullPath}\"" }; Process.Start(info);
    }
    public event Action<IReadOnlyList<AssetItem>>? RenameRequested;
    public event Action? ItemsRenamed;
    public bool CanRename(IReadOnlyList<AssetItem> items)=>items.Count is >0 and <=200&&items.All(item=>item.FullPath.Length>3
        &&!item.Entry.Id.StartsWith("home-",StringComparison.Ordinal)&&(!item.Entry.IsDirectory||!services.Favorites.Items.Any(favorite=>
            favorite.Path.Equals(item.FullPath,StringComparison.OrdinalIgnoreCase)||favorite.Path.StartsWith(item.FullPath.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase))));
    public void Rename(IReadOnlyList<AssetItem> items){if(CanRename(items))RenameRequested?.Invoke(items.ToArray());}
    internal async Task RenameAsync(IReadOnlyList<AssetItem> items,string name)
    {
        if(!CanRename(items))throw new UiFailure("ui.rename.invalidSelection");
        if(items.Count==1&&name==Path.GetFileName(items[0].FullPath))return;
        if(!await operation.WaitAsync(0))throw new UiFailure("ui.error.fileBusy");
        try {
            foreach(var item in items)FileAccessGuard.Validate(item);
            BeforeMutation?.Invoke();await services.ReleaseSourcesAsync();foreach(var item in items)FileAccessGuard.Validate(item);
            var result=await ItemRenameService.ExecuteAsync(services,items,name,window);
            if(result.GetProperty("changes").GetArrayLength()>0)ItemsRenamed?.Invoke();
            if(!result.GetProperty("success").GetBoolean()&&!result.GetProperty("cancelled").GetBoolean())
                throw new UiFailure("ui.rename.failed",new Dictionary<string,object?>{{"count",result.GetProperty("failed").GetInt32()}});
        }finally{AfterMutation?.Invoke();operation.Release();}
    }
    public static void CopyPaths(IReadOnlyList<AssetItem> items)
        => CopyPath(string.Join(Environment.NewLine, items.Select(i => i.FullPath)));
    public static void CopyPath(string path)
    { var data = new DataPackage(); data.SetText(path); Clipboard.SetContent(data); }
    public static void OpenDirectoryInExplorer(string path)
    {
        FileAccessGuard.RejectLinks(path);
        if (!Directory.Exists(path)) throw new UiDirectoryFailure("ui.error.directoryMissing");
        var info = new ProcessStartInfo("explorer.exe") { UseShellExecute = true };
        info.ArgumentList.Add(Path.GetFullPath(path)); Process.Start(info);
    }
    public static Task CopyFilesAsync(IReadOnlyList<AssetItem> items)=>ClipboardFilesAsync(items,false);
    public Task CutFilesAsync(IReadOnlyList<AssetItem> items)
    {
        if(!CanDelete(items))throw new UiFailure("ui.error.fileSelection");
        return ClipboardFilesAsync(items,true);
    }
    private static async Task ClipboardFilesAsync(IReadOnlyList<AssetItem> items,bool cut)
    {
        var files = await StorageItemsAsync(items); var data = new DataPackage { RequestedOperation = cut?DataPackageOperation.Move:DataPackageOperation.Copy };
        data.SetStorageItems(files, !cut); Clipboard.SetContent(data);
    }
    public static async Task<IReadOnlyList<IStorageItem>> StorageItemsAsync(IReadOnlyList<AssetItem> items)
    {
        if (items.Count is < 1 or > 200) throw new UiFailure("ui.error.fileLimit");
        var result = new List<IStorageItem>();
        foreach (var item in items) { FileAccessGuard.Validate(item); result.Add(item.Entry.IsDirectory
            ? await StorageFolder.GetFolderFromPathAsync(item.FullPath) : await StorageFile.GetFileFromPathAsync(item.FullPath)); }
        return result;
    }
    public async Task DeleteAsync(IReadOnlyList<AssetItem> items)
    {
        if (!CanDelete(items)) throw new UiFailure("ui.error.fileSelection");
        if (!await operation.WaitAsync(0)) throw new UiFailure("ui.error.fileBusy");
        try
        {
            var selected=items.ToArray();items=await Task.Run(()=>selected.Select(FileAccessGuard.ResolveFileIdentity).ToArray());
            var dialog=L.Dialog(xamlRoot(),"ui.file.trashTitle",null,"ui.file.trashTitle",ContentDialogButton.Close);
            L.Bind(dialog,ContentDialog.ContentProperty,"ui.file.trashDescription",()=>new Dictionary<string,object?>{{"count",items.Count}});
            if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;
            DeleteStatusChanged?.Invoke(UiMessage.Key("ui.file.trashing",new Dictionary<string,object?>{{"count",items.Count}}));
            BeforeMutation?.Invoke();
            await services.ReleaseSourcesAsync(); await Task.Run(()=>{foreach(var item in items)FileAccessGuard.Validate(item);});
            var result = await NativeCoreRequest.SendAsync(Path.Combine(services.Root,"core/artifacts/file-operations-host/Cap7CE.Core.FileOperations.Host.exe"),
                ["--trash-session", "--parent-pid", Environment.ProcessId.ToString()], new { version = 1, requestId = 1, mode = "catalog",
                    targets = items.Select(item => new { path = item.FullPath, isDirectory = item.Entry.IsDirectory }).ToArray(),
                    cacheRoots = new[] { PreferenceStore.ProductData, PreferenceStore.DataRoot } });
            var paths = result.GetProperty("deletedPaths").EnumerateArray().Select(p => p.GetString()!).ToArray();
            if (paths.Any(path => !items.Any(item => item.FullPath.Equals(path, StringComparison.OrdinalIgnoreCase)))) throw new UiFailure("ui.error.trashResults");
            services.DeletedPaths.UnionWith(paths); ItemsDeleted?.Invoke();
            notice(result.GetProperty("success").GetBoolean()?UiMessage.Key("ui.file.trashed"):
                UiMessage.Key("ui.file.trashPartial",new Dictionary<string,object?>{{"count",result.GetProperty("failedItems").GetArrayLength()}}));
        }
        finally { DeleteStatusChanged?.Invoke(null);AfterMutation?.Invoke(); operation.Release(); }
    }
    public bool CanDelete(IReadOnlyList<AssetItem> items)=>items.Count is >0 and <=200&&items.All(item=>
        item.FullPath.Length>3&&!item.Entry.Id.StartsWith("home-",StringComparison.Ordinal));
    public string? KeywordsUnavailable(IReadOnlyList<AssetItem> items,bool automatic=false)
    {
        var targets=items.Where(item=>automatic?item.Entry.IsDirectory||FormatRegistry.Find(item.Entry.Extension)?.CanAIIndex==true:!item.Entry.IsDirectory).ToArray();
        if(targets.Length==0)return automatic?"ui.keywords.unsupported":"ui.keywords.selectFiles";
        if(services.Core?.IsConnected!=true)return "ui.error.coreNotConnected";
        foreach(var item in targets) {
            var volume=services.Volumes.FirstOrDefault(v=>!string.IsNullOrEmpty(item.Entry.VolumeId)?v.VolumeId==item.Entry.VolumeId:
                string.Equals(v.DisplayName.TrimEnd('\\')+"\\",Path.GetPathRoot(item.FullPath),StringComparison.OrdinalIgnoreCase));
            if(volume is null||!volume.Selected||volume.State is not ("ready" or "catchingUp" or "building" or "needsRebuild")
                ||!(volume.Queryable||volume.Processed>0||volume.State=="ready"))return "ui.error.sourceIndex";
            if(automatic&&item.Entry.IsDirectory&&!volume.Queryable)return "ui.error.autoIndex";
        }
        return null;
    }
    public event Action<IReadOnlyList<AssetItem>>? KeywordsEdited;
    private bool editingKeywords;
    public void EditKeywords(IReadOnlyList<AssetItem> items)=>Run(async()=>{
        if(editingKeywords)return;
        var reason=KeywordsUnavailable(items);if(reason is not null)throw new UiFailure(reason);
        editingKeywords=true;
        try{if(await Views.KeywordEditDialog.ShowAsync(xamlRoot(),services,items.ToArray(),notice))KeywordsEdited?.Invoke(items);}
        finally{editingKeywords=false;}
    });
    public MenuFlyout Menu(IReadOnlyList<AssetItem> items,bool home=false)=>ResultContextMenu.Build(this,services.Favorites,items,home,services.Preferences.Current);
}

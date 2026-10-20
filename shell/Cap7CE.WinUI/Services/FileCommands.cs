using System.Diagnostics;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage;

namespace Cap7CE.WinUI.Services;
internal sealed class FileCommands(ShellServices services, Func<XamlRoot> xamlRoot, Action<string> notice)
{
    private readonly SemaphoreSlim operation = new(1);
    public event Action<AssetItem>? PreviewRequested;
    public event Action<string>? NavigateRequested;
    public event Action? BeforeMutation;
    public event Action? AfterMutation;
    public event Action? ItemsDeleted;
    public void Run(Func<Task> action) => Execute(action);
    private async void Execute(Func<Task> action) { try { await action(); } catch (Exception error) { notice(error.Message); } }
    public void Preview(AssetItem item) { FileAccessGuard.Validate(item); PreviewRequested?.Invoke(item); }
    public void Open(AssetItem item)
    {
        FileAccessGuard.Validate(item);
        if (item.Entry.IsDirectory) NavigateRequested?.Invoke(item.FullPath);
        else Process.Start(new ProcessStartInfo(item.FullPath) { UseShellExecute = true });
    }
    public void Reveal(AssetItem item)
    {
        FileAccessGuard.Validate(item);
        var info = new ProcessStartInfo("explorer.exe") { UseShellExecute = true }; info.ArgumentList.Add("/select," + item.FullPath); Process.Start(info);
    }
    public static void CopyPaths(IReadOnlyList<AssetItem> items)
    { var data = new DataPackage(); data.SetText(string.Join(Environment.NewLine, items.Select(i => i.FullPath))); Clipboard.SetContent(data); }
    public static async Task CopyFilesAsync(IReadOnlyList<AssetItem> items)
    {
        var files = await StorageItemsAsync(items); var data = new DataPackage { RequestedOperation = DataPackageOperation.Copy };
        data.SetStorageItems(files, true); Clipboard.SetContent(data);
    }
    public static async Task<IReadOnlyList<IStorageItem>> StorageItemsAsync(IReadOnlyList<AssetItem> items)
    {
        if (items.Count is < 1 or > 200) throw new IOException("单次最多操作200项");
        var result = new List<IStorageItem>();
        foreach (var item in items) { FileAccessGuard.Validate(item); result.Add(item.Entry.IsDirectory
            ? await StorageFolder.GetFolderFromPathAsync(item.FullPath) : await StorageFile.GetFileFromPathAsync(item.FullPath)); }
        return result;
    }
    public async Task DeleteAsync(IReadOnlyList<AssetItem> items)
    {
        if (items.Count is < 1 or > 200) throw new IOException("单次最多操作200项");
        if (!await operation.WaitAsync(0)) throw new IOException("已有文件操作正在进行");
        try
        {
            foreach (var item in items) FileAccessGuard.Validate(item);
            var dialog = new ContentDialog { XamlRoot = xamlRoot(), Title = "移到回收站", Content = $"将选中的 {items.Count} 项移到回收站？", PrimaryButtonText = "移到回收站", CloseButtonText = "取消", DefaultButton = ContentDialogButton.Close };
            if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;
            BeforeMutation?.Invoke();
            await services.ReleaseSourcesAsync(); foreach (var item in items) FileAccessGuard.Validate(item);
            var result = await NativeCoreRequest.SendAsync(Path.Combine(services.Root,"core/artifacts/file-operations-host/Cap7CE.Core.FileOperations.Host.exe"),
                ["--trash-session", "--parent-pid", Environment.ProcessId.ToString()], new { version = 1, requestId = 1, mode = "catalog",
                    targets = items.Select(item => new { path = item.FullPath, isDirectory = item.Entry.IsDirectory }).ToArray(),
                    cacheRoots = new[] { PreferenceStore.ProductData, PreferenceStore.DataRoot } });
            var paths = result.GetProperty("deletedPaths").EnumerateArray().Select(p => p.GetString()!).ToArray();
            if (paths.Any(path => !items.Any(item => item.FullPath.Equals(path, StringComparison.OrdinalIgnoreCase)))) throw new IOException("Core 删除结果不属于本次选择");
            services.DeletedPaths.UnionWith(paths); ItemsDeleted?.Invoke();
            notice(result.GetProperty("success").GetBoolean() ? "已移到回收站" : $"部分未完成：{result.GetProperty("failedItems").GetArrayLength()} 项");
        }
        finally { AfterMutation?.Invoke(); operation.Release(); }
    }
    public MenuFlyout Menu(IReadOnlyList<AssetItem> items)
    {
        var menu = ThemeService.Menu(); if (items.Count == 0) return menu;
        var first = items[0];
        menu.Items.Add(Ui.MenuItem("预览", () => Run(() => { Preview(first); return Task.CompletedTask; }), "\uE8A7"));
        menu.Items.Add(Ui.MenuItem("打开", () => Run(() => { Open(first); return Task.CompletedTask; }), "\uE8A5"));
        menu.Items.Add(Ui.MenuItem("在资源管理器中显示", () => Run(() => { Reveal(first); return Task.CompletedTask; }), "\uE838"));
        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(Ui.MenuItem("复制文件 · Ctrl+C", () => Run(() => CopyFilesAsync(items)), "\uE8C8"));
        menu.Items.Add(Ui.MenuItem("复制路径", () => CopyPaths(items)));
        if (items.Count == 1 && first.Entry.IsDirectory)
            menu.Items.Add(Ui.MenuItem("添加到收藏", () => Run(() => services.Favorites.ExecuteAsync("add", path: first.FullPath)), "\uE734"));
        if (items.All(item => item.Entry.FileReference is not null))
        { menu.Items.Add(new MenuFlyoutSeparator()); menu.Items.Add(Ui.MenuItem("移到回收站 · Delete", () => Run(() => DeleteAsync(items)), "\uE74D")); }
        return menu;
    }
}

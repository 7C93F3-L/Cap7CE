using System.Text.Json;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage;

namespace Cap7CE.WinUI.Controls;
internal sealed class DetailsPane : UserControl
{
    private readonly ShellServices services;
    private readonly Action<string> notice;
    private readonly StackPanel column = new() { Spacing = 12, Padding = new(12) };
    private readonly Image image = new() { Height = 180, Stretch = Stretch.Uniform };
    private readonly TextBox keywords = new() { Header = "手动关键词", AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, MinHeight = 90, PlaceholderText = "每行一个关键词" };
    private readonly TextBlock message = Ui.Text("", true);
    private readonly DispatcherTimer debounce = new() { Interval = TimeSpan.FromMilliseconds(160) };
    private CancellationTokenSource selection = new();
    private AssetItem? current;
    private string? revision;
    private bool loading;
    private readonly Button save;
    private readonly Border keywordPanel;
    public DetailsPane(ShellServices services, Action<string> notice)
    {
        this.services = services; this.notice = notice;
        save = Ui.Button("保存关键词", () => Save());
        // These controls keep one parent for the entire pane lifetime.
        keywordPanel = Ui.Panel(Ui.Column(keywords, Ui.Row(save, Ui.Button("重新读取", () => { if (current is { } item) Read(item); })), message));
        var scroll = new ScrollViewer { Content = column, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
        IdleScrollBars.Attach(scroll);Content=scroll;
        debounce.Tick += (_, _) => { debounce.Stop(); if (current is not null) Read(current); };
        Select([]);
    }
    public void Select(IReadOnlyList<AssetItem> items)
    {
        debounce.Stop(); selection.Cancel(); selection.Dispose(); selection = new(); current = items.Count == 1 ? items[0] : null;
        image.Source = null; column.Children.Clear(); revision = null; keywords.Text = ""; message.Text = ""; save.IsEnabled = false; loading = false;
        column.Children.Add(Ui.Heading(items.Count == 1 ? "详细信息" : items.Count == 0 ? "未选择项目" : $"已选择 {items.Count} 项"));
        if (items.Count != 1)
        {
            column.Children.Add(Ui.Text(items.Count == 0 ? "选择文件查看信息和关键词。" : $"文件 {items.Count(i => !i.Entry.IsDirectory)} · 文件夹 {items.Count(i => i.Entry.IsDirectory)}")); return;
        }
        var item = items[0]; column.Children.Add(image);
        column.Children.Add(Field("名称", item.Name)); column.Children.Add(Field("类型", item.Entry.IsDirectory ? "文件夹" : item.Entry.Extension.TrimStart('.').ToUpperInvariant()));
        column.Children.Add(Field("大小", item.SizeLabel)); column.Children.Add(Field("修改时间", item.ModifiedLabel)); column.Children.Add(Field("位置", item.FullPath));
        if (!item.Entry.IsDirectory && item.Entry.FileReference is not null)
        { column.Children.Add(keywordPanel); }
        if (!item.Entry.IsDirectory) debounce.Start();
    }
    private static StackPanel Field(string name, string value)
    { var text = Ui.Text(value); text.IsTextSelectionEnabled = true; return Ui.Column(Ui.Text(name,true), text); }
    private async void Read(AssetItem item)
    {
        selection.Cancel(); selection.Dispose(); selection = new(); var token = selection.Token;
        loading = true; save.IsEnabled = false; message.Text = "读取中…";
        try
        {
            if (item.Entry.FileReference is not null && services.Core is not null)
            {
                var reply = await services.Core.RequestAsync<JsonElement>("keywords.read", new { identity = Identity(item) }, token);
                if (token.IsCancellationRequested || current != item) return;
                keywords.Text = string.Join(Environment.NewLine, reply.GetProperty("keywords").EnumerateArray().Select(x => x.GetString()));
                revision = reply.GetProperty("revision").ValueKind == JsonValueKind.Null ? null : reply.GetProperty("revision").GetString(); save.IsEnabled = true; message.Text = "";
            }
            var prepared = await services.Visuals.PrepareAsync(item.FullPath, true, token);
            var file = await StorageFile.GetFileFromPathAsync(prepared); using var stream = await file.OpenReadAsync();
            var bitmap = new BitmapImage { DecodePixelWidth = 600 }; await bitmap.SetSourceAsync(stream);
            if (!token.IsCancellationRequested && current == item) image.Source = bitmap;
        }
        catch (OperationCanceledException) { }
        catch (Exception error) { if (!token.IsCancellationRequested && current == item) message.Text = "读取未完成：" + error.Message; }
        finally { if (!token.IsCancellationRequested) loading = false; }
    }
    private static object Identity(AssetItem item) => new { item.Entry.VolumeId, item.Entry.FileReference, item.Entry.CreatedFileTimeMilliseconds };
    private async void Save()
    {
        if (current is not { } item || services.Core is null || loading) return;
        save.IsEnabled = false;
        try
        {
            FileAccessGuard.Validate(item);
            var values = keywords.Text.Split(['\r','\n','，',','], StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim()).Where(s => s.Length>0).Distinct().ToArray();
            var reply = await services.Core.RequestAsync<JsonElement>("keywords.write",new { identity=Identity(item),keywords=values,expectedRevision=revision });
            if (!reply.GetProperty("saved").GetBoolean()) throw new IOException("关键词已在其他窗口变化，请重新读取后保存");
            notice("关键词已保存");
            if (current == item) { revision=reply.GetProperty("current").GetProperty("revision").GetString(); message.Text="已保存"; }
        }
        catch(Exception error) { notice(error.Message); }
        finally { if(current==item) save.IsEnabled=true; }
    }
    public void Stop() { debounce.Stop(); selection.Cancel(); image.Source=null; }
}

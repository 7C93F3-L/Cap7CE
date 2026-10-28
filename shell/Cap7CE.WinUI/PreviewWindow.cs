using System.Text.Json;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using DispatcherQueuePriority = Microsoft.UI.Dispatching.DispatcherQueuePriority;
using Windows.Storage;
using Windows.Storage.Streams;
using Windows.Media.Core;
using Windows.System;

namespace Cap7CE.WinUI;
internal sealed class PreviewWindow : Window
{
    private readonly ShellServices services;
    private readonly Grid root=new(){Padding=new(5)};
    private readonly ContentControl content=new(){HorizontalContentAlignment=HorizontalAlignment.Stretch,VerticalContentAlignment=VerticalAlignment.Stretch};
    private readonly Grid viewport=new(){Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent)};
    private readonly TextBlock status=Ui.Text("",true);
    private readonly PreviewNavigationView navigation;
    private IReadOnlyList<AssetItem> items=[];
    private CancellationTokenSource reading=new();
    private string sessionId="",kind="",pdfPath="";
    private int index;
    private MediaPreviewSession? media;
    private bool closed;
    private ShellPreferences? appliedPreferences;
    private readonly PreviewWindowGeometry geometry;
    private readonly PreviewSpaceKey spaceKey;
    private readonly Microsoft.UI.Dispatching.DispatcherQueueTimer followTimer;
    public event Action<AssetItem>? CurrentChanged;
    public PreviewWindow(ShellServices services,Window owner)
    {
        WindowTitleBinding.Attach(this,"ui.window.previewTitle");
        geometry=new(this,owner,viewport);
        followTimer=DispatcherQueue.CreateTimer();followTimer.Interval=TimeSpan.FromMilliseconds(140);followTimer.IsRepeating=false;
        followTimer.Tick+=(_,_)=>{if(!closed&&index>=0&&index<items.Count)Load(items[index]);};
        this.services=services;AppWindow.Resize(new(1100,820));
        root.RowDefinitions.Add(new(){Height=GridLength.Auto});root.RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});root.RowDefinitions.Add(new(){Height=GridLength.Auto});
        viewport.Children.Add(content);Grid.SetRow(viewport,1);root.Children.Add(viewport);Grid.SetRow(status,2);root.Children.Add(status);
        PreviewViewportStyle.Apply(viewport);
        navigation=new(viewport,()=>Move(-1),()=>Move(1));Canvas.SetZIndex(navigation,10);viewport.Children.Add(navigation);
        var surface=new ContentControl {Content=root,IsTabStop=true,HorizontalContentAlignment=HorizontalAlignment.Stretch,VerticalContentAlignment=VerticalAlignment.Stretch};Content=surface;
        var initialFocusPending=true;
        surface.Loaded+=(_,_)=>DispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low,()=>{
            if(!closed&&initialFocusPending&&surface.Focus(FocusState.Programmatic))initialFocusPending=false;
        });
        Activated+=(_,_)=>surface.Focus(FocusState.Programmatic);
        surface.KeyDown+=(_,e)=>{if(e.OriginalSource is TextBox)return;if(e.Key==VirtualKey.Escape){e.Handled=true;if(!e.KeyStatus.WasKeyDown)Close();}};
        spaceKey=new(this,()=>{if(!closed)Close();},delta=>{if(!closed)Move(delta);});Closed+=(_,_)=>spaceKey.Dispose();
        Closed+=(_,_)=>{closed=true;followTimer.Stop();UnobserveItems();reading.Cancel();ReleaseMedia();_=CloseSessionAsync();};
        // Install the titlebar/content root before Show can force the first layout.
        ApplyAppearance();
        services.Preferences.Changed+=ApplyTheme;Closed+=(_,_)=>services.Preferences.Changed-=ApplyTheme;
    }
    private void ApplyTheme()=>DispatcherQueue.TryEnqueue(()=>{if(!closed)ApplyAppearance();});
    private void ApplyAppearance()
    {
        var prefs=services.Preferences.Current;
        if(appliedPreferences is not {} previous||(previous with{AlwaysOnTop=prefs.AlwaysOnTop,PreviewAlwaysOnTop=prefs.PreviewAlwaysOnTop,Language=prefs.Language})!=prefs)
            ThemeService.Apply(this,root,prefs);
        WindowTitleBar.ConfigurePin(this,prefs.PreviewAlwaysOnTop,SetPinned);appliedPreferences=prefs;
    }
    private async void SetPinned(bool value)
    {
        try{await services.Preferences.UpdateAsync(prefs=>prefs with{PreviewAlwaysOnTop=value});}
        catch(Exception error){if(!closed){ApplyAppearance();status.Visibility=Visibility.Visible;L.Message(status,TextBlock.TextProperty,UiMessage.Key("ui.preview.pinFailed",new Dictionary<string,object?>{{"error",FailureText.From(error)}}));}}
    }
    private void ReleaseMedia(){var previous=media;media=null;previous?.Dispose();}
    public void Show(AssetItem item,IReadOnlyList<AssetItem> source)
    {
        followTimer.Stop();UnobserveItems();items=source;index=FindIndex(item);if(index<0){items=[item];index=0;}
        if(items is System.Collections.Specialized.INotifyCollectionChanged observable)observable.CollectionChanged+=ItemsChanged;
        geometry.BeginOpen();Activate();Load(item);
    }
    private int FindIndex(AssetItem item){for(var i=0;i<items.Count;i++)if(string.Equals(items[i].FullPath,item.FullPath,StringComparison.OrdinalIgnoreCase))return i;return -1;}
    private int NextIndex(int delta){for(var i=index+delta;i>=0&&i<items.Count;i+=delta)if(!items[i].Entry.IsDirectory)return i;return -1;}
    private void ItemsChanged(object? sender,System.Collections.Specialized.NotifyCollectionChangedEventArgs e)=>UpdateNavigation();
    private void UnobserveItems(){if(items is System.Collections.Specialized.INotifyCollectionChanged observable)observable.CollectionChanged-=ItemsChanged;}
    private void UpdateNavigation()=>navigation.Update(NextIndex(-1)>=0,NextIndex(1)>=0);
    public void FollowSelection(AssetItem item)
    {
        var target=FindIndex(item);if(closed||target<0||target==index||item.Entry.IsDirectory)return;
        index=target;reading.Cancel();followTimer.Stop();followTimer.Start();UpdateNavigation();
    }
    private void Move(int delta){var target=NextIndex(delta);if(target<0)return;followTimer.Stop();index=target;CurrentChanged?.Invoke(items[index]);Load(items[index]);}
    private async void Load(AssetItem item)
    {
        if(closed)return;
        reading.Cancel();reading.Dispose();reading=new();var token=reading.Token;
        ReleaseMedia();content.Content=null;L.Bind(status,TextBlock.TextProperty,"ui.preview.preparing");
        status.Visibility=Visibility.Visible;root.Padding=new(5);
        UpdateNavigation();
        var sourceValidated=false;
        try
        {
            await CloseSessionAsync();token.ThrowIfCancellationRequested();FileAccessGuard.Validate(item);sourceValidated=true;
            sessionId=Guid.NewGuid().ToString();kind=item.Entry.IsDirectory?"folder":FormatRegistry.Find(item.Entry.Extension)?.PreviewKind??"fileInfo";
            var animation=item.Entry.IsDirectory?null:await AnimationSource.TryLoadAsync(item.FullPath,token);
            token.ThrowIfCancellationRequested();
            if(animation is not null) {
                status.Visibility=Visibility.Collapsed;
                var animatedPreview=new ImagePreviewView(()=>OpenExternal(true));content.Content=animatedPreview;
                var size=await animatedPreview.LoadAnimationAsync(animation,token);
                token.ThrowIfCancellationRequested();geometry.Apply(size.Width,size.Height);return;
            }
            if(kind is "folder" or "fileInfo")
            {
                await ShowFileInfoAsync(item,token);return;
            }
            if(kind is "video" or "audio")
            {
                status.Visibility=Visibility.Collapsed;
                var file=await StorageFile.GetFileFromPathAsync(item.FullPath);
                token.ThrowIfCancellationRequested();
                if(kind=="audio")geometry.Apply(640,640);
                media=new MediaPreviewSession(file,message=>{if(!closed&&!token.IsCancellationRequested){status.Visibility=Visibility.Visible;L.Message(status,TextBlock.TextProperty,message);}},
                    (width,height)=>{if(!closed&&!token.IsCancellationRequested&&kind=="video")geometry.Apply(width,height);},autoPlayAndLoop:true);
                if(kind=="audio") {
                    var audio=new AudioPreviewView(item,media.Element);content.Content=audio;
                    await audio.LoadAsync(file,item,services,token);
                } else content.Content=media.Element;
                return;
            }
            if(kind=="text")
            {
                geometry.Apply(800,560,24,110);
                var reply=await services.Providers.RequestAsync("text.read",[sessionId,item.FullPath],token);
                if(!reply.GetProperty("ok").GetBoolean())throw new IOException(reply.GetProperty("error").GetProperty("message").GetString());
                if(token.IsCancellationRequested)return;
                var value=reply.GetProperty("value");var raw=value.GetProperty("content").GetString()??"";
                if(item.Entry.Extension.ToLowerInvariant() is ".doc" or ".docx") {
                    content.Content=Text(raw);L.Bind(status,TextBlock.TextProperty,value.GetProperty("truncated").GetBoolean()?"ui.preview.textTruncated":"ui.preview.textBody");return;
                }
                status.Visibility=Visibility.Collapsed;
                var textPreview=new TextPreviewView(()=>OpenExternal(true),token);content.Content=textPreview;
                textPreview.SetText(raw,item.Entry.Extension,
                    UiMessage.Key(value.GetProperty("truncated").GetBoolean()?"ui.preview.truncatedEncoding":"ui.preview.textEncoding",new Dictionary<string,object?>{{"encoding",value.GetProperty("encoding").GetString()}}));return;
            }
            if(kind is "pdf" or "office")
            {
                pdfPath=item.FullPath;
                if(kind=="office")pdfPath=(await services.Office.RequestAsync("office.open",[sessionId,item.FullPath],token)).GetProperty("pdfPath").GetString()!;
                token.ThrowIfCancellationRequested();status.Visibility=Visibility.Collapsed;
                var pdf=new PdfPreviewView(()=>OpenExternal(true),
                    (width,height)=>{if(!closed&&!token.IsCancellationRequested)geometry.Apply(width,height);},
                    message=>{if(!closed&&!token.IsCancellationRequested){status.Visibility=Visibility.Visible;L.Message(status,TextBlock.TextProperty,message);}});
                content.Content=pdf;await pdf.LoadAsync(pdfPath,token);return;
            }
            if(kind is "epub" or "mobi" or "archive" or "font")
            {
                geometry.Apply(800,560,24,110);
                var args=kind=="font"?new object?[]{sessionId,item.FullPath,AppLanguage.Session.Current}:new object?[]{sessionId,item.FullPath};
                var reply=await services.Providers.RequestAsync(kind+".open",args,token);if(token.IsCancellationRequested)return;
                if(kind is "epub" or "mobi") {
                    status.Visibility=Visibility.Collapsed;
                    var book=new TextPreviewView(()=>OpenExternal(true),token);content.Content=book;
                    book.SetBookText(reply.GetProperty("chapters").EnumerateArray().Select(c=>c.GetProperty("text").GetString()??"").ToArray());return;
                }
                else if(kind=="archive") {
                    status.Visibility=Visibility.Collapsed;content.Content=new ArchivePreviewView(reply);return;
                }
                else {
                    status.Visibility=Visibility.Collapsed;
                    var font=new FontPreviewView(token);content.Content=font;await font.LoadAsync(item.FullPath,reply,token);return;
                }
            }
            var prepared=await services.Visuals.PrepareAsync(item.FullPath,true,token);
            token.ThrowIfCancellationRequested();
            status.Visibility=Visibility.Collapsed;root.Padding=new(5);
            var previewImage=new ImagePreviewView(()=>OpenExternal(true));content.Content=previewImage;
            var dimensions=await previewImage.LoadAsync(prepared,token);
            token.ThrowIfCancellationRequested();geometry.Apply(dimensions.Width,dimensions.Height);
            if(!token.IsCancellationRequested)L.Bind(status,TextBlock.TextProperty,"ui.preview.position",()=>new Dictionary<string,object?>{{"index",index+1},{"total",items.Count}});
        }
        catch(OperationCanceledException){}
        catch(Exception error){if(!token.IsCancellationRequested){
            NativeDiagnostics.VisualFailure(error);
            await ShowFileInfoAsync(item,token,sourceValidated);
        }}
    }
    private async Task ShowFileInfoAsync(AssetItem item,CancellationToken token,bool readThumbnail=true)
    {
        if(closed||token.IsCancellationRequested)return;
        ReleaseMedia();geometry.Apply(720,680);status.Visibility=Visibility.Collapsed;
        var info=new FileInfoPreviewView(item,()=>OpenExternal(true));content.Content=info;
        if(readThumbnail)await info.LoadAsync(item,token);
    }
    private static ScrollViewer Text(string text)
    {
        var scroll=new ScrollViewer {Content=new TextBlock {Text=text,IsTextSelectionEnabled=true,TextWrapping=TextWrapping.Wrap,Margin=new(12),FontSize=15},HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};
        IdleScrollBars.Attach(scroll);return scroll;
    }
    private async Task CloseSessionAsync()
    {
        var id=sessionId;var old=kind;sessionId="";kind="";if(id.Length==0)return;
        try
        {
            if(old=="text")await services.Providers.RequestAsync("text.cancel",[id]);
            else if(old is "font" or "epub" or "mobi" or "archive")await services.Providers.RequestAsync(old+".close",[id]);
            if(old=="office")await services.Office.RequestAsync("office.close",[id]);
        }catch{}
    }
    private void OpenExternal(bool closeAfter=false)
    {if(index<0||index>=items.Count)return;try{FileAccessGuard.Validate(items[index]);System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(items[index].FullPath){UseShellExecute=true});if(closeAfter)Close();}catch(Exception error){status.Visibility=Visibility.Visible;L.Message(status,TextBlock.TextProperty,FailureText.From(error));}}
}

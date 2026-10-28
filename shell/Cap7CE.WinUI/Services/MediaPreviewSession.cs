using System.Runtime.InteropServices;
using Cap7CE.WinUI.Localization;
using Microsoft.UI.Xaml.Controls;
using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.Storage;
using Cap7CE.WinUI.Themes;

namespace Cap7CE.WinUI.Services;

// Own the player explicitly instead of disposing a player still owned by XAML.
internal sealed class MediaPreviewSession : IDisposable
{
    public MediaPlayerElement Element {get;}=new(){AreTransportControlsEnabled=true,AutoPlay=false};
    private readonly MediaPlayer player=new(){AutoPlay=false};
    private readonly MediaSource source;
    private readonly Action<UiMessage> failure;
    private readonly Action<double,double>? dimensions;
    private bool disposed;
    public MediaPreviewSession(StorageFile file,Action<UiMessage> failure,Action<double,double>? dimensions=null,bool autoPlayAndLoop=false)
    {
        this.failure=failure;this.dimensions=dimensions;source=MediaSource.CreateFromStorageFile(file);
        LanguageUi.Bind(Element,Microsoft.UI.Xaml.FrameworkElement.LanguageProperty,"language.tag");
        try {
            PreviewViewportStyle.Apply(Element);
            player.MediaFailed+=Failed;player.MediaOpened+=Opened;
            Element.AutoPlay=autoPlayAndLoop;player.AutoPlay=autoPlayAndLoop;player.IsLoopingEnabled=autoPlayAndLoop;
            Element.SetMediaPlayer(player);player.Source=source;
        }
        catch {Dispose();throw;}
    }
    private void Opened(MediaPlayer sender,object args)=>Element.DispatcherQueue.TryEnqueue(()=>{
        if(disposed||dimensions is null)return;
        try {
            var width=player.PlaybackSession.NaturalVideoWidth;var height=player.PlaybackSession.NaturalVideoHeight;
            if(width>0&&height>0)dimensions(width,height);
        } catch(Exception error) when(error is COMException or ObjectDisposedException){NativeDiagnostics.VisualFailure(error);}
    });
    private void Failed(MediaPlayer sender,MediaPlayerFailedEventArgs args)
    {
        var message=args.ErrorMessage;
        Element.DispatcherQueue.TryEnqueue(()=>{if(!disposed)failure(UiMessage.Key("ui.preview.mediaFailed",new Dictionary<string,object?>{{"error",message}}));});
    }
    public void Dispose()
    {
        if(disposed)return;disposed=true;
        // XAML can already have aborted playback during window teardown.
        // Each step must still run even if a previous COM object was closed.
        Cleanup(()=>player.MediaFailed-=Failed);
        Cleanup(()=>player.MediaOpened-=Opened);
        Cleanup(()=>Element.SetMediaPlayer(null));
        Cleanup(()=>player.Source=null);
        Cleanup(player.Dispose);
        Cleanup(source.Dispose);
    }
    private static void Cleanup(Action action)
    {
        try {action();}
        catch(Exception error) when(error is COMException or ObjectDisposedException)
        {NativeDiagnostics.VisualFailure(error);}
    }
}

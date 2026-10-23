using System.Runtime.InteropServices;
using Microsoft.UI.Xaml.Controls;
using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.Storage;

namespace Cap7CE.WinUI.Services;

// Own the player explicitly instead of disposing a player still owned by XAML.
internal sealed class MediaPreviewSession : IDisposable
{
    public MediaPlayerElement Element {get;}=new(){AreTransportControlsEnabled=true,AutoPlay=false};
    private readonly MediaPlayer player=new(){AutoPlay=false};
    private readonly MediaSource source;
    private readonly Action<string> failure;
    private bool disposed;
    public MediaPreviewSession(StorageFile file,Action<string> failure)
    {
        this.failure=failure;source=MediaSource.CreateFromStorageFile(file);
        try {player.MediaFailed+=Failed;Element.SetMediaPlayer(player);player.Source=source;}
        catch {Dispose();throw;}
    }
    private void Failed(MediaPlayer sender,MediaPlayerFailedEventArgs args)
    {
        var message=args.ErrorMessage;
        Element.DispatcherQueue.TryEnqueue(()=>{if(!disposed)failure("媒体播放失败："+message);});
    }
    public void Dispose()
    {
        if(disposed)return;disposed=true;
        // XAML can already have aborted playback during window teardown.
        // Each step must still run even if a previous COM object was closed.
        Cleanup(()=>player.MediaFailed-=Failed);
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

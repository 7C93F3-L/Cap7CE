using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage.Streams;
namespace Cap7CE.WinUI.DesktopActions;
// Decodes a transient glow surface; no files, persistent cache or per-frame regeneration.
internal sealed class CapsuleGlowImage : Grid
{
    private (int Width,int Height,uint First,uint Second,bool Selected)? current;
    private int revision;
    private readonly Image image=new(){Stretch=Stretch.Fill};
    public CapsuleGlowImage(){IsHitTestVisible=false;Opacity=0;Children.Add(image);Unloaded+=(_,_)=>{revision++;current=null;image.Source=null;};}
    public async void Configure(int width,int height,uint first,uint second,bool selected)
    {
        var key=(width,height,first,second,selected);if(current==key)return;current=key;var version=++revision;
        try{
            var bytes=CapsuleGlowTexture.Png(width,height,first,second,selected);
            using var stream=new InMemoryRandomAccessStream();
            using(var writer=new DataWriter(stream)){writer.WriteBytes(bytes);await writer.StoreAsync();writer.DetachStream();}
            stream.Seek(0);var bitmap=new BitmapImage();await bitmap.SetSourceAsync(stream);
            if(version==revision)image.Source=bitmap;
        }catch(Exception error){if(version==revision){current=null;NativeDiagnostics.VisualFailure(error);}}
    }
}

using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Imaging;

namespace Cap7CE.WinUI.Services;

// Cache files are already prepared by Core. Let XAML own asynchronous file loading.
internal static class CachedBitmapLoader
{
    public static async Task<BitmapImage> LoadAsync(Image target,string path,int decodeWidth,CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var bitmap=new BitmapImage {DecodePixelWidth=decodeWidth};
        var ready=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        void Opened(object sender,RoutedEventArgs e)=>ready.TrySetResult();
        void Failed(object sender,ExceptionRoutedEventArgs e)=>ready.TrySetException(new IOException(e.ErrorMessage));
        bitmap.ImageOpened+=Opened;bitmap.ImageFailed+=Failed;
        try {
            target.Source=bitmap;bitmap.UriSource=new Uri(Path.GetFullPath(path));
            await ready.Task.WaitAsync(token);token.ThrowIfCancellationRequested();return bitmap;
        }
        catch {if(ReferenceEquals(target.Source,bitmap))target.Source=null;throw;}
        finally{bitmap.ImageOpened-=Opened;bitmap.ImageFailed-=Failed;}
    }
}

using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage;
using Windows.Storage.FileProperties;
namespace Cap7CE.WinUI.DesktopActions;
internal static class DesktopProgramIcon
{
    public static async Task LoadAsync(Button button,string path)
    {
        var request=new object();button.Tag=request;
        for(var attempt=0;attempt<2&&button.IsLoaded&&ReferenceEquals(button.Tag,request);attempt++){
            try{
                var file=await StorageFile.GetFileFromPathAsync(path);
                using var thumbnail=await file.GetThumbnailAsync(ThumbnailMode.SingleItem,32,ThumbnailOptions.UseCurrentScale);
                if(thumbnail is null||thumbnail.Size==0)throw new IOException("Empty application icon stream.");
                var bitmap=new BitmapImage();await bitmap.SetSourceAsync(thumbnail);
                if(button.IsLoaded&&ReferenceEquals(button.Tag,request))button.Content=new Image{Source=bitmap,Width=28,Height=28};
                return;
            }catch(Exception error){SessionDiagnostics.Record("desktop.icon.failed",new{attempt=attempt+1,type=error.GetType().Name,hresult=$"0x{error.HResult:X8}"});}
            if(attempt==0)await Task.Delay(150);
        }
    }
}

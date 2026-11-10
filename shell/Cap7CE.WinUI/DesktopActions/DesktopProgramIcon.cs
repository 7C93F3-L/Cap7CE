using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage;
using Windows.Storage.FileProperties;
namespace Cap7CE.WinUI.DesktopActions;
internal static class DesktopProgramIcon
{
    public static async Task LoadAsync(Button button,string path)
    {
        button.Tag=path;
        try{var file=await StorageFile.GetFileFromPathAsync(path);using var thumbnail=await file.GetThumbnailAsync(ThumbnailMode.SingleItem,32,ThumbnailOptions.UseCurrentScale);
            if(thumbnail is null)return;var bitmap=new BitmapImage();await bitmap.SetSourceAsync(thumbnail);
            if(Equals(button.Tag,path))button.Content=new Image{Source=bitmap,Width=28,Height=28};
        }catch(Exception){/* Retain the fallback glyph for absent files or unavailable icons. */}
    }
}

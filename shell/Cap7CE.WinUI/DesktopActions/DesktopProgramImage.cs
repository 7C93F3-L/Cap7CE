using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Graphics.Imaging;
using Windows.Storage;
using Windows.Storage.FileProperties;
using Windows.Storage.Streams;
namespace Cap7CE.WinUI.DesktopActions;
internal static class DesktopProgramImage
{
    public static async Task<BitmapImage> ReadAsync(string path,CancellationToken token)
    {
        var bitmap=new BitmapImage();
        if(path.StartsWith(DesktopProgram.AppsPrefix,StringComparison.Ordinal)||Path.GetExtension(path).Equals(".lnk",StringComparison.OrdinalIgnoreCase)){
            var image=await DesktopShellImage.ReadAsync(path,token);token.ThrowIfCancellationRequested();
            using var stream=new InMemoryRandomAccessStream();
            var encoder=await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId,stream);
            encoder.SetPixelData(BitmapPixelFormat.Bgra8,BitmapAlphaMode.Premultiplied,(uint)image.Width,(uint)image.Height,96,96,image.Pixels);
            await encoder.FlushAsync();stream.Seek(0);await bitmap.SetSourceAsync(stream);
        }else {
            var file=await StorageFile.GetFileFromPathAsync(path);
            using var thumbnail=await file.GetThumbnailAsync(ThumbnailMode.SingleItem,32,ThumbnailOptions.UseCurrentScale);
            if(thumbnail is null||thumbnail.Size==0)throw new IOException("Empty application icon stream.");
            await bitmap.SetSourceAsync(thumbnail);
        }
        return bitmap;
    }
}

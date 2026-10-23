using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Data.Pdf;
using Windows.Storage;
using Windows.Storage.Streams;

namespace Cap7CE.WinUI.Controls;

// Owns only document paging; zoom, bounded panning and idle tools use the image viewport.
internal sealed class PdfPreviewView : Grid
{
    private readonly ImagePreviewView viewer;
    private readonly Button previous,next;
    private readonly TextBlock count=Ui.Text("",true);
    private readonly Action<double,double> resized;
    private readonly Action<string> failed;
    private PdfDocument? document;
    private CancellationToken token;
    private uint page;
    private bool rendering;
    public PdfPreviewView(Action openExternal,Action<double,double> resized,Action<string> failed)
    {
        this.resized=resized;this.failed=failed;
        previous=Ui.Tool("\uE76B","上一页",()=>Move(-1));next=Ui.Tool("\uE76C","下一页",()=>Move(1));
        count.VerticalAlignment=VerticalAlignment.Center;
        viewer=new(openExternal,Ui.Row(previous,count,next));Children.Add(viewer);
    }
    public async Task LoadAsync(string path,CancellationToken cancellation)
    {
        token=cancellation;
        var file=await StorageFile.GetFileFromPathAsync(path);token.ThrowIfCancellationRequested();
        document=await PdfDocument.LoadFromFileAsync(file);token.ThrowIfCancellationRequested();
        await RenderAsync();
    }
    private async void Move(int delta)
    {
        if(rendering||document is null||token.IsCancellationRequested)return;
        var target=(long)page+delta;if(target<0||target>=document.PageCount)return;
        var old=page;page=(uint)target;
        try{await RenderAsync();}
        catch(OperationCanceledException){}
        catch(Exception error){page=old;UpdateButtons();failed(error.Message);}
    }
    private void UpdateButtons()
    {previous.IsEnabled=!rendering&&page>0;next.IsEnabled=!rendering&&document is not null&&page+1<document.PageCount;}
    private async Task RenderAsync()
    {
        if(document is null)return;
        rendering=true;UpdateButtons();
        try
        {
            using var pdfPage=document.GetPage(page);
            using var stream=new InMemoryRandomAccessStream();
            var size=pdfPage.Size;var ratio=Math.Min(2,2000/Math.Max(size.Width,size.Height));
            await pdfPage.RenderToStreamAsync(stream,new PdfPageRenderOptions {
                DestinationWidth=(uint)Math.Max(1,size.Width*ratio),DestinationHeight=(uint)Math.Max(1,size.Height*ratio)});
            token.ThrowIfCancellationRequested();stream.Seek(0);
            var bitmap=new BitmapImage();await bitmap.SetSourceAsync(stream);token.ThrowIfCancellationRequested();
            viewer.SetBitmap(bitmap);count.Text=$"{page+1} / {document.PageCount}";resized(size.Width,size.Height);
        }
        finally{rendering=false;if(!token.IsCancellationRequested)UpdateButtons();}
    }
}

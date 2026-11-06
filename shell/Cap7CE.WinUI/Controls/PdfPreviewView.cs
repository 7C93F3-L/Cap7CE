using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Cap7CE.WinUI.Localization;
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
    private readonly Action<UiMessage> failed;
    private PdfDocument? document;
    private CancellationToken token;
    private uint page;
    private bool rendering;
    private int wheelDelta;
    public PdfPreviewView(Action openExternal,Action<double,double> resized,Action<UiMessage> failed)
    {
        this.resized=resized;this.failed=failed;
        previous=L.Tool("\uE76B","ui.preview.previousPage",()=>Move(-1));next=L.Tool("\uE76C","ui.preview.nextPage",()=>Move(1));
        count.VerticalAlignment=VerticalAlignment.Center;
        viewer=new(openExternal,Ui.Row(previous,count,next),WheelPage);Children.Add(viewer);
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
        catch(Exception error){page=old;UpdateButtons();failed(FailureText.From(error));}
    }
    private void WheelPage(int delta)
    {
        if(rendering||document is null||token.IsCancellationRequested){wheelDelta=0;return;}
        if(Math.Sign(delta)!=Math.Sign(wheelDelta))wheelDelta=0;
        wheelDelta+=delta;if(Math.Abs(wheelDelta)<120)return;
        var direction=-Math.Sign(wheelDelta);wheelDelta=0;Move(direction);
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

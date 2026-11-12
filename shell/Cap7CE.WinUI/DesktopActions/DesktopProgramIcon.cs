using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml.Controls;
namespace Cap7CE.WinUI.DesktopActions;
internal static class DesktopProgramIcon
{
    public static async Task LoadAsync(Button button,string path,CancellationToken token=default)
    {
        if(button.Tag is CancellationTokenSource previous)previous.Cancel();
        using var request=CancellationTokenSource.CreateLinkedTokenSource(token);button.Tag=request;token=request.Token;
        void Unloaded(object sender,Microsoft.UI.Xaml.RoutedEventArgs e)=>request.Cancel();button.Unloaded+=Unloaded;
        try{for(var attempt=0;attempt<2&&!token.IsCancellationRequested&&button.IsLoaded&&ReferenceEquals(button.Tag,request);attempt++){
            try{
                var bitmap=await DesktopProgramImage.ReadAsync(path,token);
                if(!token.IsCancellationRequested&&button.IsLoaded&&ReferenceEquals(button.Tag,request))button.Content=new Image{Source=bitmap,Width=28,Height=28};
                return;
            }catch(OperationCanceledException){return;}catch(Exception error){SessionDiagnostics.Record("desktop.icon.failed",new{attempt=attempt+1,type=error.GetType().Name,hresult=$"0x{error.HResult:X8}"});}
            if(attempt==0)await Task.Delay(150);
        }}finally{button.Unloaded-=Unloaded;if(ReferenceEquals(button.Tag,request))button.Tag=null;}
    }
}

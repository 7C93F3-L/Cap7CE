using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Windows.ApplicationModel.DataTransfer;
namespace Cap7CE.WinUI.Controls;
internal static class ResultDrag
{
    public static void Prepare(DataPackage data,IReadOnlyList<AssetItem> items,Action cancel)
    {
        if(items.Count is <1 or >200||items.Any(item=>item.FullPath.Length==0)){cancel();return;}
        data.RequestedOperation=DataPackageOperation.Copy;
        data.SetDataProvider(StandardDataFormats.StorageItems,async request=>{
            var deferral=request.GetDeferral();try{request.SetData(await FileCommands.StorageItemsAsync(items));}catch{}finally{deferral.Complete();}
        });
    }
}

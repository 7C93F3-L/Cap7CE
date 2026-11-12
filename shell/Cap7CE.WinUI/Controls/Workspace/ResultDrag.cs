using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Windows.ApplicationModel.DataTransfer;
namespace Cap7CE.WinUI.Controls;
internal static class ResultDrag
{
    private static readonly HashSet<object> active=[];
    private static readonly Dictionary<object,DragStorageDelivery> deliveries=[];
    public static bool IsActive=>active.Count>0;
    public static event Action? Changed;
    public static void SetActive(object source,bool value)
    {if(value?active.Add(source):active.Remove(source))Changed?.Invoke();}
    public static DataPackageOperation AllowedOperations(bool allowMove)=>allowMove?DataPackageOperation.Copy|DataPackageOperation.Move:DataPackageOperation.Copy;
    public static void Complete(object source,DataPackageOperation result)
    {if(deliveries.Remove(source,out var delivery))delivery.Complete(result);}
    public static void Prepare(object source,DataPackage data,IReadOnlyList<AssetItem> items,Action cancel)
    {
        if(items.Count is <1 or >200||items.Any(item=>item.FullPath.Length==0)){cancel();return;}
        // Preferred operation is separate from the drag source's capability mask.
        data.RequestedOperation=DataPackageOperation.Copy;
        Complete(source,DataPackageOperation.None);
        deliveries[source]=new(data,items);
    }
}

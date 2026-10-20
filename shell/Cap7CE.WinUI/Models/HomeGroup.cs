using Microsoft.UI.Xaml.Data;
namespace Cap7CE.WinUI.Models;
[Bindable]
public sealed class HomeGroup(string title,IEnumerable<AssetItem> items) : List<AssetItem>(items)
{
    public string Title {get;}=title;
}

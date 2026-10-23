using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;

internal sealed class MaintenanceSettingsView : StackPanel
{
    public MaintenanceSettingsView(ShellServices services,Window owner)
    {
        Spacing=16;
        Children.Add(new SettingsCard("目录索引","建立文件名与目录索引，用于快速搜索。",new IndexMaintenanceView(services),true));
    }
}

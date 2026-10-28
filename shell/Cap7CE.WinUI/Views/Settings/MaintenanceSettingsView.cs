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
        Children.Add(new SettingsCard("native.index.title","native.index.description",new IndexMaintenanceView(services),true,localized:true));
    }
}

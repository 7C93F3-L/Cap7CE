using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;

internal sealed class MaintenanceSettingsView : StackPanel
{
    public MaintenanceSettingsView(ShellServices services,Window owner,bool focusIndex=false)
    {
        Spacing=16;
        var index=new IndexMaintenanceView(services);
        var control=focusIndex?(UIElement)new SettingsExpandable(index.Options,index,initiallyExpanded:true):index;
        var card=new SettingsCard("native.index.title","native.index.description",control,true,localized:true);
        if(focusIndex)card.Loaded+=(_,_)=>card.DispatcherQueue.TryEnqueue(()=>card.StartBringIntoView());
        Children.Add(card);
    }
}

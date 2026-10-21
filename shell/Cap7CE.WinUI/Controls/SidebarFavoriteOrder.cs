using System.Collections.ObjectModel;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Windows.ApplicationModel.DataTransfer;
using Windows.System;

namespace Cap7CE.WinUI.Controls;

// Owns only the sidebar's temporary order and native ListView reordering mode.
internal sealed class SidebarFavoriteOrder
{
    private readonly ListView list;
    private readonly Button done,cancel;
    private FavoriteService? service;
    private FileCommands? commands;
    private ObservableCollection<Favorite>? draft;
    private string[] baseline=[];
    private bool busy,dragging;
    public bool Editing=>draft is not null;
    public StackPanel Actions {get;}=new(){Orientation=Orientation.Horizontal,Spacing=2,Visibility=Visibility.Collapsed};
    public event Action? Changed;
    public SidebarFavoriteOrder(ListView list)
    {
        this.list=list;
        list.Resources.MergedDictionaries.Add(new ResourceDictionary{Source=new Uri("ms-appx:///Themes/SidebarOrderResources.xaml")});
        done=Action("M5 12L10 17L20 7","完成排序",()=>commands?.Run(Save));
        cancel=Action("M6 6L18 18M18 6L6 18","取消排序",()=>Cancel());
        Actions.Children.Add(done);Actions.Children.Add(cancel);
        list.DragItemsStarting+=(_,e)=>{
            if(!Editing||busy||e.Items.Count!=1){e.Cancel=true;return;}
            dragging=true;e.Data.RequestedOperation=DataPackageOperation.Move;
        };
        list.DragItemsCompleted+=(_,_)=>dragging=false;
        list.DragOver+=(_,e)=>{if(!Editing||!dragging)e.AcceptedOperation=DataPackageOperation.None;};
        list.KeyDown+=(_,e)=>{
            if(!Editing||busy||draft is null)return;
            var alt=Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Menu).HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down);
            if(!alt||e.Key is not (VirtualKey.Up or VirtualKey.Down))return;
            e.Handled=true;var from=list.SelectedIndex;var to=from+(e.Key==VirtualKey.Up?-1:1);
            if(from<0||to<0||to>=draft.Count)return;
            draft.Move(from,to);list.SelectedIndex=to;
        };
        list.Unloaded+=(_,_)=>{if(!busy)Cancel();};
    }
    private static Button Action(string path,string label,Action click)
    {
        var button=new Button{Width=26,Height=26,Padding=new(4),Style=(Style)Application.Current.Resources["CapSidebarButton"],
            Content=new SidebarIcon{Width=18,Height=18,OutlinePath=path}};
        AutomationProperties.SetName(button,label);ToolTipService.SetToolTip(button,label);button.Click+=(_,_)=>click();return button;
    }
    public void Bind(FavoriteService value,FileCommands actions){service=value;commands=actions;Refresh();}
    public void Refresh(){if(!Editing&&service is not null)list.ItemsSource=service.Items;}
    public void Begin(Favorite item)
    {
        if(Editing||service is null||service.Items.Count<2)return;
        baseline=service.Items.Select(value=>value.Id).ToArray();draft=new(service.Items);list.ItemsSource=draft;
        list.IsItemClickEnabled=false;list.CanDragItems=list.CanReorderItems=list.AllowDrop=true;
        Actions.Visibility=Visibility.Visible;Changed?.Invoke();list.SelectedItem=item;list.Focus(FocusState.Programmatic);
    }
    public bool Cancel()
    {
        if(!Editing)return false;
        if(!busy)Finish();return true;
    }
    private void Finish()
    {
        draft=null;baseline=[];dragging=false;list.CanDragItems=list.CanReorderItems=list.AllowDrop=false;
        list.IsItemClickEnabled=true;Actions.Visibility=Visibility.Collapsed;Refresh();Changed?.Invoke();
    }
    private async Task Save()
    {
        if(busy||draft is null||service is null)return;
        var ids=draft.Select(item=>item.Id).ToArray();
        if(ids.SequenceEqual(baseline)){Finish();return;}
        busy=true;list.IsEnabled=done.IsEnabled=cancel.IsEnabled=false;
        try {await service.ExecuteAsync("reorder",orderedIds:ids,expectedIds:baseline);Finish();}
        catch {try{await service.ExecuteAsync();}catch{}throw;}
        finally {busy=false;list.IsEnabled=done.IsEnabled=cancel.IsEnabled=true;}
    }
}

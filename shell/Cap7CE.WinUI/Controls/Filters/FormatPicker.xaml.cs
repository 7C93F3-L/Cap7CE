using Cap7CE.WinUI.Models;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Data;

namespace Cap7CE.WinUI.Controls;

public sealed partial class FormatPicker : UserControl
{
    private readonly CollectionViewSource source=new(){IsSourceGrouped=true};
    private readonly Action<string[]> apply;

    internal FormatPicker(IEnumerable<string> available,IEnumerable<string> selected,Action<string[]> apply)
    {
        this.apply=apply;
        InitializeComponent();
        var groups=FormatLetterGroup.Create(available);
        source.Source=groups;
        Formats.ItemsSource=source.View;
        Letters.ItemsSource=source.View.CollectionGroups;
        Letters.ContainerContentChanging+=(_,e)=>{
            if(!e.InRecycleQueue)e.ItemContainer.IsEnabled=e.Item is ICollectionViewGroup {Group:FormatLetterGroup group}&&group.Count>0;
        };
        var chosen=selected.ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach(var extension in groups.SelectMany(group=>group))if(chosen.Contains(extension))Formats.SelectedItems.Add(extension);
        UpdateSummary();
        IdleScrollBars.Attach(Formats);IdleScrollBars.Attach(Letters);
    }
    private void ShowIndex(object sender,RoutedEventArgs e)=>Zoom.IsZoomedInViewActive=false;
    private void ViewChanged(object sender,SemanticZoomViewChangedEventArgs e)
    {
        BackButton.Visibility=Zoom.IsZoomedInViewActive?Visibility.Visible:Visibility.Collapsed;
    }
    private void SelectionChanged(object sender,SelectionChangedEventArgs e)
    {
        foreach(var item in e.RemovedItems.Concat(e.AddedItems))
            if(Formats.ContainerFromItem(item) is ListViewItem container)SyncCheck(container);
        UpdateSummary();
    }
    private void FormatContainerChanged(ListViewBase sender,ContainerContentChangingEventArgs args)
    {
        if(args.InRecycleQueue)return;
        if(args.Phase==0){args.RegisterUpdateCallback(1,FormatContainerChanged);return;}
        SyncCheck(args.ItemContainer);
    }
    private static void SyncCheck(SelectorItem container)
    {
        // The list retains pointer/keyboard selection and accessibility. A passive
        // native CheckBox supplies the same state transition as settings checkboxes.
        if(container.ContentTemplateRoot is CheckBox check)check.IsChecked=container.IsSelected;
    }
    private void UpdateSummary(){if(Summary is not null)L.Bind(Summary,TextBlock.TextProperty,"ui.filters.selectedFormats",()=>new Dictionary<string,object?>{{"count",Formats.SelectedItems.Count}});}
    private void ClearSelection(object sender,RoutedEventArgs e)=>Formats.SelectedItems.Clear();
    private void ApplySelection(object sender,RoutedEventArgs e)=>apply(Formats.SelectedItems.Cast<string>().Order(StringComparer.OrdinalIgnoreCase).ToArray());
}

using Cap7CE.WinUI.Models;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
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
    private void SelectionChanged(object sender,SelectionChangedEventArgs e)=>UpdateSummary();
    private void UpdateSummary(){if(Summary is not null)L.Bind(Summary,TextBlock.TextProperty,"ui.filters.selectedFormats",()=>new Dictionary<string,object?>{{"count",Formats.SelectedItems.Count}});}
    private void ClearSelection(object sender,RoutedEventArgs e)=>Formats.SelectedItems.Clear();
    private void ApplySelection(object sender,RoutedEventArgs e)=>apply(Formats.SelectedItems.Cast<string>().Order(StringComparer.OrdinalIgnoreCase).ToArray());
}

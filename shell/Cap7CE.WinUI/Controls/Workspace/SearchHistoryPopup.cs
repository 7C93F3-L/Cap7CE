using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.System;
namespace Cap7CE.WinUI.Controls;
// Owns only the anchored suggestion surface. Keeps typing focus in the native TextBox.
internal sealed class SearchHistoryPopup
{
    private readonly TextBox input;
    private readonly Func<bool> available;
    private readonly Action<string> submit;
    private readonly Flyout popup;
    private readonly ListView list=new(){SelectionMode=ListViewSelectionMode.Single,IsItemClickEnabled=true,IsTabStop=false,MaxHeight=280};
    private readonly StackPanel surface;
    private FrameworkElement? root;
    private Func<string,IReadOnlyList<string>>? provider;
    private Action? clear;
    private string? dismissedText;
    private int openRevision;
    public SearchHistoryPopup(TextBox input,Func<bool> available,Action<string> submit)
    {
        this.input=input;this.available=available;this.submit=submit;
        var label=LanguageUi.Text("ui.desktop.recent",true);label.VerticalAlignment=VerticalAlignment.Center;
        var clearButton=LanguageUi.Button("ui.desktop.clear",()=>{Close();clear?.Invoke();});clearButton.Padding=new(8,2,8,2);clearButton.MinHeight=28;
        var header=new Grid{Margin=new(8,0,2,4)};header.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});header.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        header.Children.Add(label);Grid.SetColumn(clearButton,1);header.Children.Add(clearButton);
        surface=Ui.Column(header,list);popup=ThemeService.Flyout(surface);popup.ShowMode=FlyoutShowMode.Transient;popup.OverlayInputPassThroughElement=input;
        popup.Closed+=(_,_)=>dismissedText=input.Text;
        var presenter=new Style(typeof(FlyoutPresenter));presenter.Setters.Add(new Setter(Control.PaddingProperty,new Thickness(6)));
        presenter.Setters.Add(new Setter(Control.BackgroundProperty,Application.Current.Resources["CapFlyoutSurfaceBrush"]));
        presenter.Setters.Add(new Setter(Control.CornerRadiusProperty,Application.Current.Resources["CapPanelRadius"]));
        presenter.Setters.Add(new Setter(FrameworkElement.MinWidthProperty,0d));presenter.Setters.Add(new Setter(FrameworkElement.MaxWidthProperty,double.PositiveInfinity));popup.FlyoutPresenterStyle=presenter;
        var style=new Style(typeof(ListViewItem)){BasedOn=(Style)Application.Current.Resources["DefaultListViewItemStyle"]};
        style.Setters.Add(new Setter(Control.IsTabStopProperty,false));style.Setters.Add(new Setter(Control.HorizontalContentAlignmentProperty,HorizontalAlignment.Stretch));list.ItemContainerStyle=style;
        list.SetValue(ScrollViewer.HorizontalScrollModeProperty,ScrollMode.Disabled);list.SetValue(ScrollViewer.HorizontalScrollBarVisibilityProperty,ScrollBarVisibility.Disabled);
        list.ItemClick+=(_,e)=>Choose((string)e.ClickedItem);
        input.GotFocus+=(_,_)=>input.DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low,Refresh);input.TextChanged+=(_,_)=>Refresh();
        input.AddHandler(UIElement.PointerPressedEvent,new PointerEventHandler((_,e)=>{if(e.GetCurrentPoint(input).Properties.IsLeftButtonPressed)Open();}),true);
        input.PreviewKeyDown+=Key;
        input.LostFocus+=(_,_)=>input.DispatcherQueue.TryEnqueue(()=>{if(input.XamlRoot is null||!Within(FocusManager.GetFocusedElement(input.XamlRoot) as DependencyObject,surface))Close();});
        input.SizeChanged+=(_,_)=>Close();input.Unloaded+=(_,_)=>{Close();Detach();};
        input.Loaded+=(_,_)=>Attach();
    }
    public void SetProvider(Func<string,IReadOnlyList<string>>? value,Action? clearHistory){provider=value;clear=clearHistory;if(value is null)Close();else if(popup.IsOpen)Refresh();}
    public void Close(){openRevision++;dismissedText=input.Text;popup.Hide();}
    public void Open(){var revision=++openRevision;input.DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low,()=>{if(revision!=openRevision)return;dismissedText=null;Refresh();});}
    private void Attach(){Detach();root=input.XamlRoot?.Content as FrameworkElement;if(root is not null)root.SizeChanged+=RootSizeChanged;}
    private void Detach(){if(root is not null)root.SizeChanged-=RootSizeChanged;root=null;}
    private void RootSizeChanged(object sender,SizeChangedEventArgs args)=>Close();
    private static bool Within(DependencyObject? item,DependencyObject target){for(;item is not null;item=VisualTreeHelper.GetParent(item))if(ReferenceEquals(item,target))return true;return false;}
    private void Refresh()
    {
        if(dismissedText==input.Text)return;
        if(!input.IsLoaded||input.ActualWidth<1||input.XamlRoot is null||input.FocusState==FocusState.Unfocused||!available()||provider is null){Close();return;}
        var items=provider(input.Text);if(items.Count==0){Close();return;}
        list.ItemsSource=items;list.SelectedIndex=-1;
        surface.RequestedTheme=input.ActualTheme;surface.Width=Math.Max(0,Math.Min(input.ActualWidth,input.XamlRoot.Size.Width)-14);
        if(!popup.IsOpen)popup.ShowAt(input,new FlyoutShowOptions{Placement=FlyoutPlacementMode.BottomEdgeAlignedLeft,ShowMode=FlyoutShowMode.Transient});
    }
    private void Choose(string term){Close();submit(term);Close();}
    private void Key(object sender,KeyRoutedEventArgs e)
    {
        if(e.Key==VirtualKey.Down&&!popup.IsOpen){dismissedText=null;Refresh();}if(!popup.IsOpen)return;
        if(e.Key is VirtualKey.Down or VirtualKey.Up){e.Handled=true;list.SelectedIndex=Math.Clamp(list.SelectedIndex+(e.Key==VirtualKey.Down?1:-1),0,list.Items.Count-1);list.ScrollIntoView(list.SelectedItem);}
        else if(e.Key==VirtualKey.Escape){e.Handled=true;Close();}
        else if(e.Key==VirtualKey.Enter){if(list.SelectedItem is string term){e.Handled=true;Choose(term);}else Close();}
        else if(e.Key==VirtualKey.Tab)Close();
    }
}

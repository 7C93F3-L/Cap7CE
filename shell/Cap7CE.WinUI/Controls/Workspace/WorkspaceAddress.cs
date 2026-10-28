using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.System;
namespace Cap7CE.WinUI.Controls;
internal sealed class WorkspaceAddress : UserControl
{
    private readonly Grid root=new(){ColumnSpacing=4,Height=30,MinWidth=0};
    private readonly Grid slot=new(){Height=30,MinWidth=0};
    private readonly StackPanel crumbs=new(){Orientation=Orientation.Horizontal,Spacing=0};
    private readonly TextBox address=new();
    private readonly TextBox search=new();
    private readonly Button toggle,badge,trailing;
    private readonly ScrollViewer breadcrumb;
    private string path="",query="";
    private bool searchMode,editing;
    public event Action<string>? Navigate,Search;
    public WorkspaceAddress()
    {
        Resources.MergedDictionaries.Add(new ResourceDictionary {Source=new Uri("ms-appx:///Themes/WorkspaceInputResources.xaml")});
        L.Bind(address,TextBox.PlaceholderTextProperty,"main.addressPlaceholder");L.Bind(search,TextBox.PlaceholderTextProperty,"main.searchPlaceholder");
        VerticalAlignment=VerticalAlignment.Center;HorizontalContentAlignment=HorizontalAlignment.Stretch;
        var inputStyle=(Style)Application.Current.Resources["CapWorkspaceInput"];address.Style=search.Style=inputStyle;
        address.Loaded+=(_,_)=>HideClearButton(address);search.Loaded+=(_,_)=>HideClearButton(search);
        root.ColumnDefinitions.Add(new(){Width=GridLength.Auto});root.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});root.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        toggle=WorkspaceIcons.ResourceButton("computer","main.toSearch",()=>{if(searchMode){searchMode=false;editing=false;Render();}else FocusSearch();});root.Children.Add(toggle);
        breadcrumb=new(){Content=crumbs,Height=30,Padding=new(0),VerticalContentAlignment=VerticalAlignment.Center,HorizontalScrollBarVisibility=ScrollBarVisibility.Hidden,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled,HorizontalScrollMode=ScrollMode.Enabled};
        breadcrumb.Tapped+=(_,e)=>{if(!HasButton(e.OriginalSource as DependencyObject))FocusPath();};
        slot.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});slot.ColumnDefinitions.Add(new(){Width=new(28)});
        slot.Children.Add(breadcrumb);slot.Children.Add(address);slot.Children.Add(search);
        trailing=new(){Style=(Style)Application.Current.Resources["CapWorkspaceEditHotspot"],VerticalAlignment=VerticalAlignment.Center};
        trailing.Click+=(_,_)=>FocusPath();L.Bind(trailing,Microsoft.UI.Xaml.Automation.AutomationProperties.NameProperty,"main.editAddress");
        Grid.SetColumn(trailing,1);slot.Children.Add(trailing);Grid.SetColumn(slot,1);root.Children.Add(slot);
        badge=new Button{Style=(Style)Application.Current.Resources["CapWorkspaceCrumb"]};L.Bind(badge,Button.ContentProperty,"main.searchActive");badge.Click+=(_,_)=>FocusSearch();Grid.SetColumn(badge,2);root.Children.Add(badge);
        address.KeyDown+=(_,e)=>{if(e.Key==VirtualKey.Enter){e.Handled=true;SubmitPath();}else if(e.Key==VirtualKey.Escape){e.Handled=true;editing=false;address.Text=path;Render();toggle.Focus(FocusState.Programmatic);}};
        address.LostFocus+=(_,_)=>{if(editing){editing=false;Render();}};
        search.TextChanged+=(_,_)=>{if(string.IsNullOrWhiteSpace(search.Text)&&!string.IsNullOrWhiteSpace(query)){query="";Search?.Invoke("");}};
        search.KeyDown+=(_,e)=>{if(e.Key==VirtualKey.Enter){e.Handled=true;Search?.Invoke(search.Text);return;}if(e.Key!=VirtualKey.Escape)return;e.Handled=true;if(search.Text.Length>0)search.Text="";else{searchMode=false;Render();toggle.Focus(FocusState.Programmatic);}};
        Content=root;Render();
    }
    public void Bind(string nextPath,string nextQuery,bool reset,bool defaultSearch=false)
    {
        if(reset){searchMode=defaultSearch||nextQuery.Length>0;editing=false;}
        if(path!=nextPath||reset){path=nextPath;address.Text=path;Rebuild();}
        if(query!=nextQuery||reset){query=nextQuery;search.Text=query;}
        Render();
    }
    private void Rebuild()
    {
        var homeName=LocationText.Computer;
        crumbs.Children.Clear();foreach(var part in WorkspacePathRules.Crumbs(path,homeName.Render(AppLanguage.Session),SystemLocations.Current.NameForPath)) {
            if(crumbs.Children.Count>0)crumbs.Children.Add(new TextBlock{Text="›",VerticalAlignment=VerticalAlignment.Center,Opacity=.5});
            var button=new Button{Content=part.Label,Style=(Style)Application.Current.Resources["CapWorkspaceCrumb"]};if(part.Path.Length==0){L.Message(button,Button.ContentProperty,homeName);L.Message(button,ToolTipService.ToolTipProperty,homeName);L.Message(button,Microsoft.UI.Xaml.Automation.AutomationProperties.NameProperty,homeName);}else WorkspaceIcons.Label(button,part.Path);
            button.Click+=(_,_)=>Navigate?.Invoke(part.Path);crumbs.Children.Add(button);
        }
    }
    private void Render()
    {
        address.Visibility=editing&&!searchMode?Visibility.Visible:Visibility.Collapsed;
        search.Visibility=searchMode?Visibility.Visible:Visibility.Collapsed;breadcrumb.Visibility=!searchMode&&!editing?Visibility.Visible:Visibility.Collapsed;
        toggle.Content=WorkspaceIcons.Icon(searchMode?"search":"computer");L.Label(toggle,searchMode?"main.toAddress":"main.toSearch");
        badge.Visibility=!searchMode&&query.Trim().Length>0?Visibility.Visible:Visibility.Collapsed;WorkspaceIcons.Label(badge,query);
        trailing.Visibility=!searchMode&&!editing?Visibility.Visible:Visibility.Collapsed;
        slot.ColumnDefinitions[1].Width=new(!searchMode&&!editing?28:0);
    }
    private static void HideClearButton(DependencyObject parent)
    {
        // Suppress only the native clear button; retain the system text editor and focus states.
        for(var i=0;i<VisualTreeHelper.GetChildrenCount(parent);i++) {
            var child=VisualTreeHelper.GetChild(parent,i);
            if(child is Button {Name:"DeleteButton"} clear){clear.Width=clear.MinWidth=clear.MaxWidth=0;clear.Padding=clear.Margin=new(0);clear.IsHitTestVisible=false;}
            else HideClearButton(child);
        }
    }
    private void SubmitPath(){var value=address.Text.Trim();if(value.Length==0)return;editing=false;Navigate?.Invoke(value);Render();}
    public void FocusSearch(){editing=false;searchMode=true;Render();search.Focus(FocusState.Programmatic);}
    public void FocusPath(){searchMode=false;editing=true;address.Text=path;Render();address.Focus(FocusState.Programmatic);address.SelectAll();}
    private bool HasButton(DependencyObject? element)
    {for(var item=element;item is not null&&!ReferenceEquals(item,breadcrumb);item=VisualTreeHelper.GetParent(item))if(item is Button)return true;return false;}
}

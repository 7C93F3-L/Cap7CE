using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.System;
namespace Cap7CE.WinUI.Controls;
internal sealed class WorkspaceAddress : UserControl
{
    private readonly Grid root=new(){ColumnSpacing=4};
    private readonly Grid slot=new();
    private readonly StackPanel crumbs=new(){Orientation=Orientation.Horizontal,Spacing=0};
    private readonly TextBox address=new(){PlaceholderText="输入目录路径",MinWidth=0,FontSize=12,Height=30,Padding=new(6,3,6,3)};
    private readonly AutoSuggestBox search=new(){PlaceholderText="搜索名称、路径、关键词",MinWidth=0,FontSize=12,Height=30};
    private readonly Button toggle,badge;
    private readonly ScrollViewer breadcrumb;
    private string path="",query="";
    private bool searchMode,editing;
    public event Action<string>? Navigate,Search;
    public WorkspaceAddress()
    {
        root.ColumnDefinitions.Add(new(){Width=GridLength.Auto});root.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});root.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        toggle=WorkspaceIcons.Button("computer","切换为搜索",()=>{if(searchMode){searchMode=false;editing=false;Render();}else FocusSearch();});root.Children.Add(toggle);
        breadcrumb=new(){Content=crumbs,HorizontalScrollBarVisibility=ScrollBarVisibility.Hidden,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled,HorizontalScrollMode=ScrollMode.Enabled};
        breadcrumb.Tapped+=(_,e)=>{if(!HasButton(e.OriginalSource as DependencyObject))FocusPath();};
        slot.Children.Add(breadcrumb);slot.Children.Add(address);slot.Children.Add(search);Grid.SetColumn(slot,1);root.Children.Add(slot);
        badge=new Button{Content="搜索中",Style=(Style)Application.Current.Resources["CapWorkspaceCrumb"]};badge.Click+=(_,_)=>FocusSearch();Grid.SetColumn(badge,2);root.Children.Add(badge);
        address.KeyDown+=(_,e)=>{if(e.Key==VirtualKey.Enter){e.Handled=true;editing=false;Navigate?.Invoke(address.Text.Trim());Render();}else if(e.Key==VirtualKey.Escape){e.Handled=true;editing=false;address.Text=path;Render();toggle.Focus(FocusState.Programmatic);}};
        address.LostFocus+=(_,_)=>{if(editing){editing=false;Render();}};
        search.QuerySubmitted+=(_,e)=>Search?.Invoke(e.QueryText);
        search.KeyDown+=(_,e)=>{if(e.Key!=VirtualKey.Escape)return;e.Handled=true;if(search.Text.Length>0){search.Text="";Search?.Invoke("");}else{searchMode=false;Render();toggle.Focus(FocusState.Programmatic);}};
        Content=root;Render();
    }
    public void Bind(string nextPath,string nextQuery,bool reset)
    {
        if(reset){searchMode=nextQuery.Length>0;editing=false;}
        if(path!=nextPath||reset){path=nextPath;address.Text=path;Rebuild();}
        if(query!=nextQuery||reset){query=nextQuery;search.Text=query;}
        Render();
    }
    private void Rebuild()
    {
        crumbs.Children.Clear();foreach(var part in WorkspacePathRules.Crumbs(path)) {
            if(crumbs.Children.Count>0)crumbs.Children.Add(new TextBlock{Text="›",VerticalAlignment=VerticalAlignment.Center,Opacity=.5});
            var button=new Button{Content=part.Label,Style=(Style)Application.Current.Resources["CapWorkspaceCrumb"]};WorkspaceIcons.Label(button,part.Path.Length==0?"此电脑":part.Path);
            button.Click+=(_,_)=>Navigate?.Invoke(part.Path);crumbs.Children.Add(button);
        }
    }
    private void Render()
    {
        address.Visibility=editing&&!searchMode?Visibility.Visible:Visibility.Collapsed;
        search.Visibility=searchMode?Visibility.Visible:Visibility.Collapsed;breadcrumb.Visibility=!searchMode&&!editing?Visibility.Visible:Visibility.Collapsed;
        toggle.Content=WorkspaceIcons.Icon(searchMode?"search":"computer");WorkspaceIcons.Label(toggle,searchMode?"切换为目录路径":"切换为搜索 · Ctrl+F");
        badge.Visibility=!searchMode&&query.Trim().Length>0?Visibility.Visible:Visibility.Collapsed;WorkspaceIcons.Label(badge,query);
    }
    public void FocusSearch(){editing=false;searchMode=true;Render();search.Focus(FocusState.Programmatic);}
    public void FocusPath(){searchMode=false;editing=true;address.Text=path;Render();address.Focus(FocusState.Programmatic);address.SelectAll();}
    private bool HasButton(DependencyObject? element)
    {for(var item=element;item is not null&&!ReferenceEquals(item,breadcrumb);item=VisualTreeHelper.GetParent(item))if(item is Button)return true;return false;}
}

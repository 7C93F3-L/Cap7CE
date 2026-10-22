using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Themes;

namespace Cap7CE.WinUI.Views;

internal sealed class SettingsWindow : Window
{
    private readonly ShellServices services;
    private readonly SettingsPages pages;
    private readonly ContentControl body=new(){HorizontalContentAlignment=HorizontalAlignment.Stretch,Margin=new(20,12,20,20)};
    private readonly TextBox search=new(){PlaceholderText="搜索设置",Margin=new(8,8,8,12),Style=(Style)Application.Current.Resources["CapWorkspaceInput"]};
    private readonly InfoBar notice=new(){IsOpen=false,IsClosable=true,Severity=InfoBarSeverity.Informational};
    private readonly Grid root=new();
    private readonly NavigationView navigation=new(){Style=(Style)Application.Current.Resources["CapSettingsNavigation"]};
    private readonly ScrollViewer scroll;
    private string category="通用";
    private bool closed;
    public SettingsWindow(ShellServices services)
    {
        this.services=services;AppWindow.Resize(new(1000,800));
        root.Resources.MergedDictionaries.Add(new ResourceDictionary {Source=new("ms-appx:///Themes/SettingsControlResources.xaml")});
        pages=new(services,this,text=>{if(closed)return;notice.Message=text;notice.IsOpen=true;});
        AutomationProperties.SetName(search,"搜索设置");navigation.PaneHeader=search;
        foreach(var (label,symbol) in new[]{("通用",Symbol.Setting),("外观",Symbol.Highlight),("缓存与索引",Symbol.Library),
            ("快捷操作",Symbol.Keyboard),("搜索与 AI",Symbol.Find),("诊断",Symbol.Repair),("关于",Symbol.Help)})
            navigation.MenuItems.Add(new NavigationViewItem {Content=label,Tag=label,Icon=new SymbolIcon(symbol)});
        navigation.SelectedItem=navigation.MenuItems[0];
        navigation.SelectionChanged+=(_,e)=>{
            if(e.SelectedItem is not NavigationViewItem item)return;
            category=item.Tag.ToString()??"通用";
            if(search.Text.Length>0)search.Text="";else Render();
            scroll?.ChangeView(null,0,null,true);
        };
        search.TextChanged+=(_,_)=>{Render();scroll?.ChangeView(null,0,null,true);};
        scroll=new ScrollViewer {Content=body,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled,HorizontalContentAlignment=HorizontalAlignment.Stretch};
        IdleScrollBars.Attach(scroll);
        navigation.Content=new Border {Style=(Style)Application.Current.Resources["CapSettingsSurface"],Child=scroll};
        root.RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});root.RowDefinitions.Add(new(){Height=GridLength.Auto});
        root.Children.Add(navigation);Grid.SetRow(notice,1);notice.Margin=new(5);root.Children.Add(notice);Content=root;
        services.Preferences.Changed+=OnPreferences;
        Closed+=(_,_)=>{closed=true;services.Preferences.Changed-=OnPreferences;};
        Render();OnPreferences();
    }
    private void OnPreferences()=>DispatcherQueue.TryEnqueue(()=>{if(!closed)ThemeService.Apply(this,root,services.Preferences.Current);});
    private void Render()=>body.Content=pages.Build(category,search.Text.Trim());
}

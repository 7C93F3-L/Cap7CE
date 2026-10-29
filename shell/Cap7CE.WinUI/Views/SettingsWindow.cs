using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Themes;
using Cap7CE.WinUI.Localization;

namespace Cap7CE.WinUI.Views;

internal sealed class SettingsWindow : Window
{
    private readonly ShellServices services;
    private readonly SettingsPages pages;
    private readonly ContentControl body=new(){HorizontalContentAlignment=HorizontalAlignment.Stretch,MaxWidth=1040,Margin=new(24,20,24,32)};
    private readonly InfoBar notice=new(){IsOpen=false,Visibility=Visibility.Collapsed,IsClosable=true,Severity=InfoBarSeverity.Informational};
    private readonly Grid root=new();
    private readonly NavigationView navigation=new(){Style=(Style)Application.Current.Resources["CapSettingsNavigation"]};
    private readonly ScrollViewer scroll;
    private readonly SettingsSubpageNavigation subpages;
    private readonly ContentControl signature=new(){HorizontalContentAlignment=HorizontalAlignment.Center,Margin=new(0,16,0,30),Visibility=Visibility.Collapsed};
    private string category="通用";
    private bool closed;
    internal bool IsViewingMaintenance=>!closed&&category=="缓存与索引"&&NativeCaptionFeedback.IsActive(WinRT.Interop.WindowNative.GetWindowHandle(this));
    public SettingsWindow(ShellServices services)
    {
        this.services=services;SettingsWindowGeometry.ApplyInitial(this);
        WindowTitleBinding.Attach(this,"ui.window.settingsTitle");
        LanguageUi.Bind(navigation,NavigationView.PaneTitleProperty,"main.settings");
        navigation.Loaded+=(_,_)=>SettingsNavigationAppearance.Apply(navigation);
        navigation.DisplayModeChanged+=(_,_)=>QueueNavigationAppearance();
        navigation.RegisterPropertyChangedCallback(NavigationView.IsPaneOpenProperty,(_,_)=>QueueNavigationAppearance());
        root.Resources.MergedDictionaries.Add(new ResourceDictionary {Source=new("ms-appx:///Themes/SettingsControlResources.xaml")});
        pages=new(services,this,text=>{if(closed)return;LanguageUi.Computed(notice,InfoBar.MessageProperty,()=>text.Render(AppLanguage.Session));notice.Visibility=Visibility.Visible;notice.IsOpen=true;});
        notice.Closed+=(_,_)=>notice.Visibility=Visibility.Collapsed;
        foreach(var (label,symbol) in new[]{("通用",Symbol.Setting),("外观",Symbol.Highlight),("缓存与索引",Symbol.Library),
            ("快捷操作",Symbol.Keyboard),("搜索与 AI",Symbol.Find),("诊断",Symbol.Repair),("关于",(Symbol)0xE946)}) // Info: circled i.
        {
            var item=new NavigationViewItem {Tag=label,Icon=new SymbolIcon(symbol)};
            LanguageUi.Bind(item,NavigationViewItem.ContentProperty,LanguageUi.CategoryKey(label));navigation.MenuItems.Add(item);
        }
        navigation.SelectedItem=navigation.MenuItems[0];
        navigation.SelectionChanged+=(_,e)=>{
            if(e.SelectedItem is not NavigationViewItem item)return;
            category=item.Tag.ToString()??"通用";
            Render();
            scroll?.ChangeView(null,0,null,true);
        };
        scroll=new ScrollViewer {Content=body,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled,HorizontalContentAlignment=HorizontalAlignment.Stretch};
        subpages=new(body,scroll);pages.SubpageRequested+=subpages.Open;
        IdleScrollBars.Attach(scroll);
        var content=new Grid();content.RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});content.RowDefinitions.Add(new(){Height=GridLength.Auto});
        content.Children.Add(scroll);Grid.SetRow(signature,1);content.Children.Add(signature);
        navigation.Content=new Border {Style=(Style)Application.Current.Resources["CapSettingsSurface"],Child=content};
        root.RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});root.RowDefinitions.Add(new(){Height=GridLength.Auto});
        root.Children.Add(navigation);Grid.SetRow(notice,1);notice.Margin=new(5);root.Children.Add(notice);Content=root;
        services.Preferences.Changed+=OnPreferences;
        Closed+=(_,_)=>{closed=true;services.Preferences.Changed-=OnPreferences;};
        Render();OnPreferences();
    }
    private void OnPreferences()=>DispatcherQueue.TryEnqueue(()=>{if(!closed)ThemeService.Apply(this,root,services.Preferences.Current);});
    private void QueueNavigationAppearance()=>navigation.DispatcherQueue.TryEnqueue(()=>{if(!closed)SettingsNavigationAppearance.Apply(navigation);});
    public void ShowMaintenance()
    {
        pages.FocusMetadata();
        if(category=="缓存与索引")Render();
        else navigation.SelectedItem=navigation.MenuItems.OfType<NavigationViewItem>().Single(item=>item.Tag.ToString()=="缓存与索引");
    }
    private void Render()
    {
        subpages.Reset();
        body.Content=pages.Build(category);signature.Visibility=category=="关于"?Visibility.Visible:Visibility.Collapsed;
        if(category=="关于"&&signature.Content is null)try {
            signature.Content=new SettingsSignature {Notice=text=>{if(!closed){LanguageUi.Computed(notice,InfoBar.MessageProperty,()=>text.Render(AppLanguage.Session));notice.Visibility=Visibility.Visible;notice.IsOpen=true;}}};
        }catch(Exception error){NativeDiagnostics.VisualFailure(error);LanguageUi.Bind(notice,InfoBar.MessageProperty,"native.signature.unavailable");notice.Visibility=Visibility.Visible;notice.IsOpen=true;}
    }
}

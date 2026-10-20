using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Themes;

namespace Cap7CE.WinUI.Views;
internal sealed class SettingsWindow : Window
{
    private readonly ShellServices services;
    private readonly SettingsPages pages;
    private readonly ContentControl body = new() { HorizontalContentAlignment=HorizontalAlignment.Stretch, Margin=new(24,12,24,20) };
    private readonly TextBox search = new() { PlaceholderText="搜索设置", Margin=new(8) };
    private readonly InfoBar notice = new() { IsOpen=false, IsClosable=true };
    private readonly Grid root = new();
    private string category="常规";
    public SettingsWindow(ShellServices services)
    {
        this.services=services; Title="设置 · Cap7CE"; AppWindow.Resize(new(1000,760));
        pages=new(services, this, text=>{notice.Message=text;notice.IsOpen=true;});
        var navigation=new ListView { ItemsSource=new[]{"常规","外观","缓存与索引","快捷操作","运行组件与模型","诊断","关于"}, SelectedIndex=0, Margin=new(8) };
        navigation.SelectionChanged+=(_,_)=>{category=navigation.SelectedItem?.ToString()??"常规"; Render();};
        search.TextChanged+=(_,_)=>Render();
        root.ColumnDefinitions.Add(new(){Width=new(210)});root.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        root.RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});root.RowDefinitions.Add(new(){Height=GridLength.Auto});
        root.Children.Add(Ui.Column(Ui.Heading("设置"),search,navigation));
        var scroll=new ScrollViewer {Content=body,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};Grid.SetColumn(scroll,1);root.Children.Add(scroll);
        Grid.SetRow(notice,1);Grid.SetColumnSpan(notice,2);root.Children.Add(notice);Content=root;
        services.Preferences.Changed+=OnPreferences;
        Closed+=(_,_)=>services.Preferences.Changed-=OnPreferences;
        Render();OnPreferences();
    }
    private void OnPreferences()=>DispatcherQueue.TryEnqueue(()=>ThemeService.Apply(this,root,services.Preferences.Current));
    private void Render()=>body.Content=pages.Build(category,search.Text.Trim());
}

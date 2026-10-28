using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Cap7CE.WinUI.Controls;

namespace Cap7CE.WinUI.Localization;

// Only explicit resource keys enter this API; file names and editable values use Ui.
internal static class LanguageUi
{
    public static void Bind(FrameworkElement target,DependencyProperty property,string key,Func<IReadOnlyDictionary<string,object?>?>? parameters=null)
        =>LanguageBinding.Attach(target,property,AppLanguage.Session,key,parameters);
    public static void Literal(FrameworkElement target,DependencyProperty property,object? value)
    {LanguageBinding.Clear(target,property);target.SetValue(property,value);}
    public static void Label(FrameworkElement target,string key,Func<IReadOnlyDictionary<string,object?>?>? parameters=null)
    {Bind(target,ToolTipService.ToolTipProperty,key,parameters);Bind(target,Microsoft.UI.Xaml.Automation.AutomationProperties.NameProperty,key,parameters);}
    public static MenuFlyoutItem MenuItem(string key,Action action,string? glyph=null,Func<IReadOnlyDictionary<string,object?>?>? parameters=null)
    {var item=Ui.MenuItem("",action,glyph);Bind(item,MenuFlyoutItem.TextProperty,key,parameters);return item;}
    public static TextBlock Text(string key,bool muted=false,Func<IReadOnlyDictionary<string,object?>?>? parameters=null)
    {var text=Ui.Text("",muted);Bind(text,TextBlock.TextProperty,key,parameters);return text;}
    public static TextBlock Heading(string key)
    {var text=Ui.Heading("");Bind(text,TextBlock.TextProperty,key);return text;}
    public static Button Button(string key,Action action)
    {var button=Ui.Button("",action);Bind(button,Microsoft.UI.Xaml.Controls.Button.ContentProperty,key);return button;}
    public static ToggleSwitch Toggle(bool enabled=true)
    {var toggle=new ToggleSwitch {IsEnabled=enabled,MinWidth=0};Bind(toggle,ToggleSwitch.OnContentProperty,"settings.enabled");Bind(toggle,ToggleSwitch.OffContentProperty,"settings.disabled");return toggle;}
    public static ComboBox Choice(string[] keys,int selected=0,bool enabled=true)
    {
        var box=new ComboBox {IsEnabled=enabled,MinWidth=160,MaxWidth=300};
        foreach(var key in keys){var item=new ComboBoxItem();Bind(item,ComboBoxItem.ContentProperty,key);box.Items.Add(item);}
        box.SelectedIndex=selected;return box;
    }
    public static string CategoryKey(string category)=>category switch {
        "通用"=>"navigation.general","外观"=>"navigation.appearance","缓存与索引"=>"navigation.storage",
        "快捷操作"=>"navigation.shortcuts","搜索与 AI"=>"navigation.models","诊断"=>"navigation.diagnostics","关于"=>"navigation.about",
        _=>throw new ArgumentOutOfRangeException(nameof(category))
    };
}

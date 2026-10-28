using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;

namespace Cap7CE.WinUI.Localization;

// Explicit key + literal fallback for recycled data templates. User data is never
// used as a lookup key, and a previous resource binding is removed on reuse.
public sealed class LanguageText : DependencyObject
{
    public static readonly DependencyProperty KeyProperty=DependencyProperty.RegisterAttached("Key",typeof(string),typeof(LanguageText),new PropertyMetadata(null,Changed));
    public static readonly DependencyProperty LiteralProperty=DependencyProperty.RegisterAttached("Literal",typeof(string),typeof(LanguageText),new PropertyMetadata("",Changed));
    public static readonly DependencyProperty NameKeyProperty=DependencyProperty.RegisterAttached("NameKey",typeof(string),typeof(LanguageText),new PropertyMetadata(null,NameChanged));
    public static string? GetNameKey(DependencyObject target)=>(string?)target.GetValue(NameKeyProperty);
    public static void SetNameKey(DependencyObject target,string? value)=>target.SetValue(NameKeyProperty,value);
    public static string? GetKey(DependencyObject target)=>(string?)target.GetValue(KeyProperty);
    public static void SetKey(DependencyObject target,string? value)=>target.SetValue(KeyProperty,value);
    public static string GetLiteral(DependencyObject target)=>(string)target.GetValue(LiteralProperty);
    public static void SetLiteral(DependencyObject target,string value)=>target.SetValue(LiteralProperty,value);
    private static void Changed(DependencyObject target,DependencyPropertyChangedEventArgs args)
    {
        if(target is not FrameworkElement element)return;
        var property=element switch {TextBlock=>TextBlock.TextProperty,ContentControl=>ContentControl.ContentProperty,_=>null};
        if(property is null)return;
        if(GetKey(target) is {Length:>0} key)LanguageUi.Bind(element,property,key);
        else LanguageUi.Literal(element,property,GetLiteral(target));
    }
    private static void NameChanged(DependencyObject target,DependencyPropertyChangedEventArgs args)
    {if(target is FrameworkElement element){if(GetNameKey(target) is {Length:>0} key)LanguageUi.Bind(element,AutomationProperties.NameProperty,key);else LanguageUi.Literal(element,AutomationProperties.NameProperty,"");}}
}

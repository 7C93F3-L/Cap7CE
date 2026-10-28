using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Localization;

// Explicit key + literal fallback for recycled data templates. User data is never
// used as a lookup key, and a previous resource binding is removed on reuse.
public sealed class LanguageText : DependencyObject
{
    public static readonly DependencyProperty KeyProperty=DependencyProperty.RegisterAttached("Key",typeof(string),typeof(LanguageText),new PropertyMetadata(null,Changed));
    public static readonly DependencyProperty LiteralProperty=DependencyProperty.RegisterAttached("Literal",typeof(string),typeof(LanguageText),new PropertyMetadata("",Changed));
    public static string? GetKey(DependencyObject target)=>(string?)target.GetValue(KeyProperty);
    public static void SetKey(DependencyObject target,string? value)=>target.SetValue(KeyProperty,value);
    public static string GetLiteral(DependencyObject target)=>(string)target.GetValue(LiteralProperty);
    public static void SetLiteral(DependencyObject target,string value)=>target.SetValue(LiteralProperty,value);
    private static void Changed(DependencyObject target,DependencyPropertyChangedEventArgs args)
    {
        if(target is not TextBlock text)return;
        if(GetKey(target) is {Length:>0} key)LanguageUi.Bind(text,TextBlock.TextProperty,key);
        else LanguageUi.Literal(text,TextBlock.TextProperty,GetLiteral(target));
    }
}

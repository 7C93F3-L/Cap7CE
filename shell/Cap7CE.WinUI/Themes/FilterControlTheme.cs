using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Themes;

// Scope native control accent overrides to filter content; keep native popup surfaces.
internal static class FilterControlTheme
{
    public static void Apply(FrameworkElement content)
    {
        var source=new Uri("ms-appx:///Themes/FilterControlResources.xaml");
        if(!content.Resources.MergedDictionaries.Any(dictionary=>dictionary.Source==source))
            content.Resources.MergedDictionaries.Add(new ResourceDictionary{Source=source});
    }

}

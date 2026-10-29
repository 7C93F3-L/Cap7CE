using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
namespace Cap7CE.WinUI.Themes;

// ContentDialog's framework-owned default-button style resolves storyboard
// resources in its own scope. Supply the existing shared brushes at that scope.
internal static class DialogAccentResources
{
    public static void Apply(ContentDialog dialog)
    {
        var source=Application.Current.Resources.MergedDictionaries.Single(dictionary=>
            dictionary.Source?.OriginalString.EndsWith("AccentResources.xaml",StringComparison.Ordinal)==true);
        var resources=new ResourceDictionary();
        foreach(var theme in new[]{"Default","Light","HighContrast"}){
            var shared=(ResourceDictionary)source.ThemeDictionaries[theme];
            var local=new ResourceDictionary();
            foreach(var kind in new[]{"Background","Foreground"})foreach(var state in new[]{"","PointerOver","Pressed"}){
                var key="AccentButton"+kind+state;local[key]=shared[key];
            }
            resources.ThemeDictionaries[theme]=local;
        }
        dialog.Resources.MergedDictionaries.Add(resources);
    }
}

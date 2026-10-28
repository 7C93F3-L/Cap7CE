namespace Cap7CE.WinUI.Models;

public sealed record ShortcutBinding(string Gesture);
internal sealed record ShortcutDefinition(string Id,string Gesture="",string Scope="app",string Context="app")
{
    public string TitleKey=>"ui.shortcuts.action."+Id;
}
internal static class ShortcutCatalog
{
    public static readonly ShortcutDefinition[] All=[
        new("focusMainSearch","Alt+`","global"),
        new("focusSearch","Ctrl+F"),new("focusPath","Ctrl+L"),new("openFolder","Ctrl+O"),
        new("newTab","Ctrl+T"),new("closeTab","Ctrl+W"),new("previousTab","Ctrl+Shift+Tab"),new("nextTab","Ctrl+Tab"),
        new("back","Alt+Left",Context:"browse"),new("forward","Alt+Right",Context:"browse"),new("up","Alt+Up",Context:"browse"),
        new("refresh","F5",Context:"browse"),new("openSettings","Ctrl+,"),new("cycleDirectory","Alt+Q",Context:"browse"),
        new("restoreDefaultWindow",Scope:"global"),new("toggleWindowMode"),
        new("togglePin"),new("toggleFilters"),new("toggleDetails"),new("viewSquare"),new("viewGallery"),new("viewList"),new("metadata"),
        new("openSelected","Enter",Context:"results"),new("previewSelected","Space",Context:"results"),
        new("deleteSelected","Delete",Context:"results"),new("selectAll","Ctrl+A",Context:"results"),new("copyFiles","Ctrl+C",Context:"results"),
        new("copyPaths",Context:"results"),new("revealFile",Context:"results"),new("aiKeywords",Context:"results")
    ];
    public static ShortcutBinding Binding(ShellPreferences preferences,ShortcutDefinition action)
    {
        var binding=preferences.ShortcutBindings?.GetValueOrDefault(action.Id)??new(action.Gesture);
        return binding with{Gesture=binding.Gesture??""};
    }
    public static string? Validate(ShortcutDefinition action,ShortcutBinding binding,ShellPreferences preferences)
    {
        if(string.IsNullOrEmpty(binding.Gesture))return null;
        if(!ShortcutGesture.TryParse(binding.Gesture,out var gesture)||!gesture.Allowed(action.Scope=="global",action.Context=="results"))return "ui.shortcuts.invalid";
        foreach(var other in All.Where(other=>other.Id!=action.Id)) {
            var value=Binding(preferences,other);
            if(ShortcutGesture.TryParse(value.Gesture,out var candidate)&&candidate==gesture)return "ui.shortcuts.duplicate";
        }
        return null;
    }
}

namespace Cap7CE.WinUI.Models;

public sealed record ShortcutBinding(string Gesture);
internal sealed record ShortcutDefinition(string Id,string Gesture="",string Scope="app",string Context="app",bool Editable=true)
{
    public string TitleKey=>"ui.shortcuts.action."+Id;
}
internal static class ShortcutCatalog
{
    public static readonly ShortcutDefinition[] All=[
        new("focusMainSearch","Alt+`","global"),
        new("focusSearch","Ctrl+F",Editable:false),new("focusPath","Ctrl+L",Editable:false),new("openFolder","Ctrl+O",Editable:false),
        new("back","Alt+Left",Context:"browse",Editable:false),new("forward","Alt+Right",Context:"browse",Editable:false),new("up","Alt+Up",Context:"browse",Editable:false),
        new("refresh","F5",Context:"browse",Editable:false),new("openSettings","Ctrl+,",Editable:false),new("cycleDirectory","Alt+Q",Context:"browse"),
        new("toggleRecursive","Ctrl+Shift+R",Context:"browse"),new("toggleRandom","Ctrl+R",Context:"browse"),
        new("refreshRandom","Ctrl+Alt+R",Context:"browse"),new("clearFilters","Ctrl+Shift+Backspace",Context:"browse"),
        new("restoreDefaultWindow","Ctrl+Alt+0",Scope:"global"),new("toggleWindowMode","Ctrl+Shift+M",Context:"browse"),
        new("togglePin","Ctrl+Shift+T",Context:"browse"),new("toggleFilters","Ctrl+Shift+F",Context:"browse"),new("toggleDetails","Ctrl+Shift+D",Context:"browse"),
        new("viewSquare","Ctrl+1",Context:"browse"),new("viewGallery","Ctrl+2",Context:"browse"),new("viewList","Ctrl+3",Context:"browse"),new("metadata","Ctrl+Shift+I",Context:"browse"),
        new("openSelected","Enter",Context:"results",Editable:false),new("previewSelected","Space",Context:"results",Editable:false),
        new("renameSelected","F2",Context:"results",Editable:false),new("deleteSelected","Delete",Context:"results",Editable:false),new("selectAll","Ctrl+A",Context:"results",Editable:false),new("copyFiles","Ctrl+C",Context:"results",Editable:false),
        new("editKeywords","Ctrl+K",Context:"results"),new("copyPaths","Ctrl+Shift+C",Context:"results"),new("revealFile","Ctrl+Shift+E",Context:"results"),new("aiKeywords","Ctrl+Shift+K",Context:"results")
    ];
    public static ShortcutBinding Binding(ShellPreferences preferences,ShortcutDefinition action)
    {
        var binding=action.Editable?preferences.ShortcutBindings?.GetValueOrDefault(action.Id)??new(action.Gesture):new(action.Gesture);
        return binding with{Gesture=binding.Gesture??""};
    }
    public static string? Validate(ShortcutDefinition action,ShortcutBinding binding,ShellPreferences preferences)
    {
        if(!action.Editable)return binding.Gesture==action.Gesture?null:"ui.shortcuts.invalid";
        if(string.IsNullOrEmpty(binding.Gesture))return null;
        if(!ShortcutGesture.TryParse(binding.Gesture,out var gesture)||!gesture.Allowed(action.Scope=="global",action.Context=="results"))return "ui.shortcuts.invalid";
        foreach(var other in All.Where(other=>other.Id!=action.Id)) {
            var value=Binding(preferences,other);
            if(ShortcutGesture.TryParse(value.Gesture,out var candidate)&&candidate==gesture)return "ui.shortcuts.duplicate";
        }
        return null;
    }
}

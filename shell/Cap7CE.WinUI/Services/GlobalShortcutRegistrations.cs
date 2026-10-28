using Cap7CE.WinUI.Models;
namespace Cap7CE.WinUI.Services;

// Each OS reservation succeeds or fails independently; capture only suspends our reservations.
internal sealed class GlobalShortcutRegistrations(Func<int,ShortcutGesture,bool> register,Action<int> unregister)
{
    private readonly Dictionary<int,string> active=[];
    public HashSet<string> Failed {get;}=[];
    public void Apply(ShellPreferences preferences,bool suspended=false)
    {
        Clear();Failed.Clear();if(!preferences.QuickActions||suspended)return;
        for(var i=0;i<ShortcutCatalog.All.Length;i++) {
            var action=ShortcutCatalog.All[i];var binding=ShortcutCatalog.Binding(preferences,action);
            if(action.Scope!="global"||string.IsNullOrEmpty(binding.Gesture))continue;
            if(ShortcutCatalog.Validate(action,binding,preferences) is not null||!ShortcutGesture.TryParse(binding.Gesture,out var gesture)
                ||!register(7302+i,gesture)){Failed.Add(action.Id);continue;}
            active.Add(7302+i,action.Id);
        }
    }
    public string? Action(int id)=>active.GetValueOrDefault(id);
    public void Clear(){foreach(var id in active.Keys)unregister(id);active.Clear();}
}

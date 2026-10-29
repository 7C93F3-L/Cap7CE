using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Localization;

internal static class ShortcutChecks
{
    public static async Task RunAsync()
    {
        var checks=0;void Check(bool value,string message){checks++;if(!value)throw new Exception(message);}
        var preferences=new ShellPreferences();
        foreach(var action in ShortcutCatalog.All){
            var binding=ShortcutCatalog.Binding(preferences,action);
            Check(ShortcutCatalog.Validate(action,binding,preferences) is null,"Every default binding must be valid and unique: "+action.Id);
        }
        Check(ShortcutCatalog.All.Count(action=>action.Scope=="global"&&action.Gesture.Length>0)==1,"Only search activation may reserve a global key by default.");
        var retired=new[]{"newTab","closeTab","previousTab","nextTab"};
        Check(!ShortcutCatalog.All.Any(action=>retired.Contains(action.Id)),"Tab-page actions must not remain assignable.");
        var retiredPreferences=preferences with{ShortcutBindings=retired.ToDictionary(id=>id,_=>new ShortcutBinding("Ctrl+F"))};
        Check(ShortcutCatalog.Validate(ShortcutCatalog.All.Single(action=>action.Id=="focusSearch"),new("Ctrl+F"),retiredPreferences) is null,"Retired action overrides must not reserve combinations or block active actions.");
        foreach(var text in new[]{"Ctrl+Shift+Tab","Alt+`","Ctrl+,","f5","Enter","ctrl+alt+K","Ctrl+Num1","Ctrl+NumAdd"}){
            Check(ShortcutGesture.TryParse(text,out var key),"Parse known gestures: "+text);
            Check(ShortcutGesture.TryParse(key.ToString(),out var normalized)&&key==normalized,"Gesture normalization must round trip.");
        }
        foreach(var text in new[]{"","Ctrl+Ctrl+K","Hyper+Q","Ctrl+","Ctrl+F25"})Check(!ShortcutGesture.TryParse(text,out _),"Reject malformed input: "+text);
        Check(!ShortcutGesture.TryParse(new ShortcutGesture(0xff,2).ToString(),out _),"Unsupported physical keys must never be relabeled as an unrelated letter.");
        Check(new ShortcutGesture(75,2)!=new ShortcutGesture(75,6),"Additional modifiers must not match a simpler shortcut.");
        var focus=ShortcutCatalog.All.Single(action=>action.Id=="focusMainSearch");
        foreach(var text in new[]{"Win+F","Alt+F4","Alt+Tab","Ctrl+Alt+Delete","Ctrl+F12","K"})
            Check(ShortcutCatalog.Validate(focus,new(text),preferences)=="ui.shortcuts.invalid","Reserved/global unsafe gesture: "+text);
        var cycle=ShortcutCatalog.All.Single(action=>action.Id=="cycleDirectory");
        Check(cycle.Scope=="app"&&ShortcutCatalog.All.Where(action=>action.Scope=="global").Select(action=>action.Id).ToHashSet().SetEquals(["focusMainSearch","restoreDefaultWindow"]),"Only activation and window recovery have fixed global scope.");
        Check(ShortcutCatalog.Validate(focus,new("ctrl+f"),preferences)=="ui.shortcuts.duplicate","Global and local assignments must not silently collide.");
        var registrations=new Dictionary<int,ShortcutGesture>();var rejected=new HashSet<int>();
        var registry=new GlobalShortcutRegistrations((id,key)=>{if(rejected.Contains(id))return false;registrations.Add(id,key);return true;},id=>registrations.Remove(id));
        registry.Apply(preferences);Check(registrations.Count==1&&registry.Action(7302)=="focusMainSearch","Default registration has one real action.");
        var restore=ShortcutCatalog.All.Single(action=>action.Id=="restoreDefaultWindow");var restoreId=7302+Array.IndexOf(ShortcutCatalog.All,restore);
        preferences=preferences with{ShortcutBindings=new(){[restore.Id]=new("Ctrl+Alt+R")}};
        rejected.Add(7302);registry.Apply(preferences);
        Check(registrations.Count==1&&registry.Action(restoreId)==restore.Id&&registry.Failed.SetEquals([focus.Id]),"One unavailable global key must not disable other actions.");
        registry.Apply(preferences,true);Check(registrations.Count==0&&registry.Action(restoreId) is null,"Capture must release only this app's hotkeys and reject queued old IDs.");
        rejected.Clear();registry.Apply(preferences);Check(registrations.Count==2&&registry.Failed.Count==0,"Finishing capture must restore and retry configured keys.");
        registry.Apply(preferences with{ShortcutBindings=new(){[focus.Id]=new("")}});
        Check(registrations.Count==0,"Clearing a global binding must release its OS registration.");
        var folder=Path.Combine(Path.GetTempPath(),"Cap7CE-shortcut-check-"+Guid.NewGuid().ToString("N"));var language=AppLanguage.Session.Current;
        try{
            var store=new PreferenceStore(Path.Combine(folder,"prefs.json"),null);await store.LoadAsync();
            await Task.WhenAll(store.UpdateAsync(value=>value with{ShortcutBindings=new(){["openSelected"]=new("Ctrl+Enter")}}),store.UpdateAsync(value=>value with{Notifications=true}));
            var reload=new PreferenceStore(Path.Combine(folder,"prefs.json"),null);await reload.LoadAsync();
            Check(reload.Current.Notifications&&reload.Current.ShortcutBindings["openSelected"].Gesture=="Ctrl+Enter","Bindings must persist without overwriting concurrent settings.");
            var legacyPath=Path.Combine(folder,"legacy-scope.json");
            const string legacy="""{"quickActions":false,"shortcutBindings":{"openSettings":{"gesture":"Ctrl+Alt+S","scope":"global"},"restoreDefaultWindow":{"gesture":"Ctrl+Alt+R","scope":"app"}}}""";
            await File.WriteAllTextAsync(legacyPath,legacy);var old=new PreferenceStore(legacyPath,null);await old.LoadAsync();
            registry.Apply(old.Current);
            Check(registrations.Values.All(key=>key.ToString()!="Ctrl+Alt+S")&&registry.Action(restoreId)==restore.Id,"Old scope fields must not change fixed ownership.");
            Check(await File.ReadAllTextAsync(legacyPath)==legacy,"Loading old scope fields must not rewrite user preferences.");
            await old.UpdateAsync(value=>value with{Notifications=true});
            Check(!(await File.ReadAllTextAsync(legacyPath)).Contains("\"scope\""),"Normal saves must no longer persist a configurable scope.");
            Check(!(await File.ReadAllTextAsync(legacyPath)).Contains("quickActions"),"Normal saves must omit the retired master switch.");
            registry.Clear();
            var blocker=Path.Combine(folder,"file");await File.WriteAllTextAsync(blocker,"not a directory");var failed=new PreferenceStore(Path.Combine(blocker,"prefs.json"),null);
            try{await failed.UpdateAsync(value=>value with{ShortcutBindings=preferences.ShortcutBindings});throw new Exception("Expected save failure");}catch(IOException){}
            Check(failed.Current.ShortcutBindings.Count==0,"Failed save must leave active preference bindings unchanged.");
        }finally{AppLanguage.Apply(language);if(Directory.Exists(folder))Directory.Delete(folder,true);}
        var catalog=new LanguageCatalog(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/languages.json")));
        foreach(var action in ShortcutCatalog.All)foreach(var languageTag in LanguageCatalog.Languages)
            Check(catalog.Text(action.TitleKey,languageTag)!=action.TitleKey,"Every assignable action must have a localized label.");
        Console.WriteLine($"Shortcut defaults, validation, independent registration and persistence: {checks} checks passed.");
    }
}

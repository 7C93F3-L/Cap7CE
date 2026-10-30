using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Services;

internal sealed class WindowShortcutService:IDisposable
{
    private readonly PreferenceStore preferences;
    private readonly NativeHotKeys global;
    private readonly WorkspaceShortcutInput local;
    private readonly Dictionary<string,Action> actions;
    private readonly Action<Exception> failure;
    private readonly Microsoft.UI.Dispatching.DispatcherQueue queue;
    private bool capturing,disposed,applyQueued;
    private string? stamp;
    public event Action? Changed;
    public WindowShortcutService(Window owner,FrameworkElement root,ResultsView results,PreferenceStore preferences,FileCommands commands,Dictionary<string,Action> actions,Action<Exception> failure)
    {
        this.preferences=preferences;this.actions=actions;this.failure=failure;queue=owner.DispatcherQueue;
        void Selected(Action<IReadOnlyList<AssetItem>> action){var selected=results.Selection;if(selected.Count>0)action(selected);}
        actions["openSelected"]=()=>Selected(items=>commands.Open(items[0]));
        actions["previewSelected"]=()=>Selected(items=>commands.Preview(items[0]));
        actions["renameSelected"]=()=>Selected(commands.Rename);
        actions["deleteSelected"]=()=>Selected(items=>{if(items.All(item=>item.Entry.FileReference is not null))commands.Run(()=>commands.DeleteAsync(items));});
        actions["selectAll"]=results.SelectAll;actions["copyFiles"]=()=>Selected(items=>commands.Run(()=>FileCommands.CopyFilesAsync(items)));
        actions["copyPaths"]=()=>Selected(FileCommands.CopyPaths);actions["revealFile"]=()=>Selected(items=>commands.Reveal(items[0]));
        actions["aiKeywords"]=()=>Selected(commands.AutoKeywords);
        global=new(owner,Execute,failure);local=new(owner,root,results,Execute);preferences.Changed+=PreferencesChanged;
    }
    private void PreferencesChanged()
    {
        if(disposed||applyQueued)return;applyQueued=true;
        if(!queue.TryEnqueue(()=>{applyQueued=false;Apply();}))applyQueued=false;
    }
    private void Execute(string id){if(disposed||capturing||ResultDrag.IsActive)return;try{if(actions.TryGetValue(id,out var action))action();}catch(Exception error){failure(error);}}
    public void Apply()
    {
        if(disposed)return;var current=preferences.Current;
        var next=string.Join("|",ShortcutCatalog.All.Select(action=>action.Id+":"+ShortcutCatalog.Binding(current,action)));
        if(stamp==next)return;stamp=next;global.Registrations.Apply(current,capturing);local.Apply(current);Changed?.Invoke();
    }
    public void Capture(bool value){if(disposed)return;capturing=value;global.Registrations.Apply(preferences.Current,value);Changed?.Invoke();}
    public string Status(ShortcutDefinition action)
    {
        var binding=ShortcutCatalog.Binding(preferences.Current,action);
        if(string.IsNullOrEmpty(binding.Gesture))return "ui.shortcuts.unbound";
        if(ShortcutCatalog.Validate(action,binding,preferences.Current) is not null)return "ui.shortcuts.invalid";
        if(action.Scope!="global")return "ui.shortcuts.appScope";
        return global.Registrations.Failed.Contains(action.Id)?"ui.shortcuts.conflict":"ui.shortcuts.registered";
    }
    public void Dispose(){if(disposed)return;disposed=true;preferences.Changed-=PreferencesChanged;local.Dispose();global.Dispose();Changed=null;}
}

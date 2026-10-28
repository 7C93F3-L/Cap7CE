using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Controls;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using L=Cap7CE.WinUI.Localization.LanguageUi;

namespace Cap7CE.WinUI.Views;

internal sealed class SettingsShortcutEditor:UserControl
{
    private readonly ShellServices services;
    private readonly Window owner;
    private readonly Action<UiMessage> notice;
    private readonly StackPanel global=Ui.Column(),local=Ui.Column();
    private readonly ToggleSwitch enabled=L.Toggle();
    private bool syncing,busy,capturing,listening;
    public SettingsShortcutEditor(ShellServices services,Window owner,Action<UiMessage> notice)
    {
        this.services=services;this.owner=owner;this.notice=notice;
        L.Bind(enabled,ToggleSwitch.HeaderProperty,"ui.shortcuts.globalToggle");
        enabled.Toggled+=async(_,_)=>{if(!syncing)await Run(()=>services.Preferences.UpdateAsync(value=>value with{QuickActions=enabled.IsOn}));};
        var reset=L.Button("common.restoreDefault",()=>_=Run(()=>services.Preferences.UpdateAsync(value=>value with{ShortcutBindings=[]})));
        Content=Ui.Column(Ui.Row(enabled,reset),L.Text("ui.shortcuts.globalHint",true),L.Text("ui.shortcuts.globalHeading"),global,L.Text("ui.shortcuts.appHeading"),local);
        Loaded+=(_,_)=>{if(listening)return;listening=true;if(services.Shortcuts is {} manager)manager.Changed+=Render;Render();};
        Unloaded+=(_,_)=>{listening=false;if(services.Shortcuts is {} manager){manager.Changed-=Render;if(capturing)manager.Capture(false);}};
        Render();
    }
    private void Render()
    {
        syncing=true;enabled.IsOn=services.Preferences.Current.QuickActions;syncing=false;
        global.Children.Clear();local.Children.Clear();
        foreach(var action in ShortcutCatalog.All) {
            var binding=ShortcutCatalog.Binding(services.Preferences.Current,action);
            (action.Scope=="global"?global:local).Children.Add(Row(action,binding));
        }
    }
    private UIElement Row(ShortcutDefinition action,ShortcutBinding binding)
    {
        var label=L.Text(action.TitleKey,true);
        var status=L.Text(services.Shortcuts?.Status(action)??"ui.shortcuts.unavailable",true);
        var gesture=new Button {MinWidth=112};
        if(binding.Gesture.Length==0)L.Bind(gesture,Button.ContentProperty,"ui.shortcuts.unbound");else gesture.Content=binding.Gesture;
        L.Label(gesture,"ui.shortcuts.change");gesture.Click+=async(_,_)=>{
            if(busy)return;busy=true;capturing=true;services.Shortcuts?.Capture(true);
            try{
                var value=await ShortcutCaptureDialog.ShowAsync(owner,action,services.Preferences.Current);
                if(value is not null)await Save(action,new(value));
            }catch(Exception error){notice(FailureText.From(error));}
            finally{capturing=false;services.Shortcuts?.Capture(false);busy=false;Render();}
        };
        var clear=L.Button("ui.shortcuts.clear",()=>_=Run(()=>Save(action,new(""))));
        var reset=L.Button("ui.shortcuts.resetOne",()=>_=Run(()=>services.Preferences.UpdateAsync(value=>{
            var bindings=new Dictionary<string,ShortcutBinding>(value.ShortcutBindings??[]);bindings.Remove(action.Id);var next=value with{ShortcutBindings=bindings};
            var reason=ShortcutCatalog.Validate(action,ShortcutCatalog.Binding(next,action),next);if(reason is not null)throw new UiFailure(reason);return next;
        })));
        var controls=Ui.Row(gesture,clear,reset);var row=new StackPanel {Spacing=4,Margin=new(0,4,0,12),Children={label,controls,status}};
        return row;
    }
    private Task Save(ShortcutDefinition action,ShortcutBinding binding)=>services.Preferences.UpdateAsync(value=>{
        var reason=ShortcutCatalog.Validate(action,binding,value);if(reason is not null)throw new UiFailure(reason);
        var bindings=new Dictionary<string,ShortcutBinding>(value.ShortcutBindings??[]){[action.Id]=binding};return value with{ShortcutBindings=bindings};
    });
    private async Task Run(Func<Task> action)
    {if(busy)return;busy=true;try{await action();}catch(Exception error){notice(FailureText.From(error));}finally{busy=false;Render();}}
}

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
        var header=new Grid{ColumnSpacing=16};header.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});header.ColumnDefinitions.Add(new(){Width=GridLength.Auto});header.Children.Add(enabled);Grid.SetColumn(reset,1);header.Children.Add(reset);
        global.Spacing=local.Spacing=4;
        Content=Ui.Column(header,L.Text("ui.shortcuts.globalHint",true),L.Text("ui.shortcuts.globalHeading"),global,L.Text("ui.shortcuts.appHeading"),local);
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
        var label=L.Text(action.TitleKey);label.VerticalAlignment=VerticalAlignment.Center;
        var statusKey=services.Shortcuts?.Status(action)??"ui.shortcuts.unavailable";
        var status=L.Text(statusKey,true);status.Visibility=statusKey is "ui.shortcuts.conflict" or "ui.shortcuts.invalid" or "ui.shortcuts.unavailable"?Visibility.Visible:Visibility.Collapsed;
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
        var more=L.Tool("\uE712","ui.settings.more",()=>{});var menu=new MenuFlyout();
        menu.Items.Add(L.MenuItem("ui.shortcuts.clear",()=>_=Run(()=>Save(action,new("")))));
        menu.Items.Add(L.MenuItem("ui.shortcuts.resetOne",()=>_=Run(()=>services.Preferences.UpdateAsync(value=>{
            var bindings=new Dictionary<string,ShortcutBinding>(value.ShortcutBindings??[]);bindings.Remove(action.Id);var next=value with{ShortcutBindings=bindings};
            var reason=ShortcutCatalog.Validate(action,ShortcutCatalog.Binding(next,action),next);if(reason is not null)throw new UiFailure(reason);return next;
        }))));more.Flyout=menu;
        var row=new Grid{ColumnSpacing=12,RowSpacing=4};row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});row.ColumnDefinitions.Add(new(){Width=GridLength.Auto});row.ColumnDefinitions.Add(new(){Width=GridLength.Auto});row.RowDefinitions.Add(new(){Height=GridLength.Auto});row.RowDefinitions.Add(new(){Height=GridLength.Auto});row.RowDefinitions.Add(new(){Height=GridLength.Auto});
        row.Children.Add(label);row.Children.Add(gesture);row.Children.Add(more);row.Children.Add(status);
        var host=new Border{Style=(Style)Application.Current.Resources["CapSettingsShortcutRow"],Child=row};
        void Arrange(){var narrow=host.ActualWidth>0&&host.ActualWidth<500;Grid.SetColumn(gesture,narrow?0:1);Grid.SetRow(gesture,narrow?1:0);gesture.HorizontalAlignment=narrow?HorizontalAlignment.Left:HorizontalAlignment.Stretch;Grid.SetColumnSpan(label,narrow?2:1);Grid.SetColumn(more,2);Grid.SetRow(status,narrow?2:1);Grid.SetColumnSpan(status,3);}
        host.SizeChanged+=(_,_)=>Arrange();Arrange();return host;
    }
    private Task Save(ShortcutDefinition action,ShortcutBinding binding)=>services.Preferences.UpdateAsync(value=>{
        var reason=ShortcutCatalog.Validate(action,binding,value);if(reason is not null)throw new UiFailure(reason);
        var bindings=new Dictionary<string,ShortcutBinding>(value.ShortcutBindings??[]){[action.Id]=binding};return value with{ShortcutBindings=bindings};
    });
    private async Task Run(Func<Task> action)
    {if(busy)return;busy=true;try{await action();}catch(Exception error){notice(FailureText.From(error));}finally{busy=false;Render();}}
}

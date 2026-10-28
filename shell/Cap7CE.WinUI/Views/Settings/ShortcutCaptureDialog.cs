using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Windows.System;
using L=Cap7CE.WinUI.Localization.LanguageUi;

namespace Cap7CE.WinUI.Views;

internal static class ShortcutCaptureDialog
{
    public static async Task<string?> ShowAsync(Window owner,ShortcutDefinition action,ShellPreferences preferences)
    {
        string? candidate=null;
        var key=L.Text("ui.shortcuts.captureHint",true);var error=L.Text("ui.shortcuts.captureEmpty",true);
        var dialog=L.Dialog(owner.Content.XamlRoot,action.TitleKey,"ui.shortcuts.captureHint","ui.shortcuts.apply");
        dialog.Content=UiContent(key,error);dialog.IsPrimaryButtonEnabled=false;dialog.DefaultButton=ContentDialogButton.None;
        dialog.PreviewKeyDown+=(_,args)=>{
            if(args.Key==VirtualKey.Escape||args.Key==VirtualKey.Tab&&WorkspaceShortcutInput.Modifiers()==0)return;
            args.Handled=true;
            if(args.Key is VirtualKey.Control or VirtualKey.Menu or VirtualKey.Shift or VirtualKey.LeftWindows or VirtualKey.RightWindows)return;
            var gesture=new ShortcutGesture((uint)args.Key,WorkspaceShortcutInput.Modifiers());
            candidate=gesture.ToString();var reason=ShortcutCatalog.Validate(action,new(candidate),preferences);
            L.Literal(key,TextBlock.TextProperty,candidate);L.Bind(error,TextBlock.TextProperty,reason??"ui.shortcuts.captureReady");
            dialog.IsPrimaryButtonEnabled=reason is null;
        };
        return await dialog.ShowAsync()==ContentDialogResult.Primary?candidate:null;
    }
    private static UIElement UiContent(params UIElement[] elements)=>Cap7CE.WinUI.Controls.Ui.Column(elements);
}

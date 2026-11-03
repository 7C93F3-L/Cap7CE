using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using L = Cap7CE.WinUI.Localization.LanguageUi;

namespace Cap7CE.WinUI.Controls;

internal sealed class NativeUpdateView : UserControl
{
    private readonly NativeUpdates updates;
    private readonly TextBlock status = Ui.Text("", true);
    private readonly StackPanel actions;
    private readonly StackPanel section;
    private readonly Expander expander;
    private readonly ProgressBar progress = new() { Minimum = 0, Maximum = 100 };
    private readonly Button check, download, pause, install;
    private bool loaded, checkingOnLoad;
    public NativeUpdateView(ShellServices services, bool checkOnLoad)
    {
        var updates=this.updates=services.Updates; checkingOnLoad = checkOnLoad;
        check = L.Button("settings.checkForUpdates", Check);
        download = L.Button("settings.downloadUpdateNow", () => _ = updates.DownloadAsync());
        pause = L.Button("settings.pauseUpdate", () => _ = updates.PauseAsync());
        install = L.Button("settings.installUpdateNow", Install);
        var version = L.Text("settings.updateCurrentVersion", parameters: () => new Dictionary<string, object?> { ["version"] = NativeVersion.Text });
        status.Style = (Style)Application.Current.Resources["CapSettingsDescription"];
        status.TextWrapping = TextWrapping.Wrap;
        actions = Ui.Row(download, pause, install); actions.HorizontalAlignment = HorizontalAlignment.Right;
        var details = Ui.Column(status, progress, actions); details.Spacing = 8; details.Margin = new(12, 8, 12, 8);
        section=details;section.Visibility=Visibility.Collapsed;
        var automatic=new ToggleSwitch{IsOn=services.Preferences.Current.AutomaticUpdateChecks,OnContent="",OffContent="",MinWidth=0};
        L.Label(automatic,"ui.update.automaticCheck");
        automatic.Toggled+=async(_,_)=>{
            if(!automatic.IsEnabled)return;automatic.IsEnabled=false;
            try{await services.Preferences.UpdateAsync(value=>value with{AutomaticUpdateChecks=automatic.IsOn});}
            catch(Exception error){automatic.IsOn=services.Preferences.Current.AutomaticUpdateChecks;L.Message(status,TextBlock.TextProperty,FailureText.From(error));status.Visibility=section.Visibility=Visibility.Visible;}
            finally{automatic.IsEnabled=true;}
        };
        var divider=new Border{Style=(Style)Application.Current.Resources["CapSettingsCommandRow"],Padding=new(0),MinHeight=0};
        var body=Ui.Column(Row(version,check),section,divider,Row(L.Text("ui.update.automaticCheck"),automatic));body.Spacing=0;
        var card=new SettingsCard("settings.versionUpdate","ui.update.description",new SettingsExpandable(body,initiallyExpanded:checkOnLoad),localized:true);
        Content=card;expander=(Expander)card.Content;expander.Padding=new(16,0,16,0);
        Loaded += OnLoaded; Unloaded += (_, _) => { loaded = false; updates.Changed -= Refresh; };
    }
    private async void OnLoaded(object sender, RoutedEventArgs args)
    {
        if (loaded) return; loaded = true; updates.Changed += Refresh; Refresh();
        try { await updates.LoadAsync(); if (checkingOnLoad) { checkingOnLoad = false; await updates.CheckAsync(); } }
        catch (Exception error) { NativeDiagnostics.CoreFailure(error.ToString()); if (loaded) { L.Message(status, TextBlock.TextProperty, UiMessage.Key("settings.updateCheckFailed")); status.Visibility = section.Visibility = Visibility.Visible; } }
    }
    private void Refresh()
    {
        if (!loaded) return;
        var state = updates.State;
        check.IsEnabled = !updates.Busy && !state.Busy;
        download.IsEnabled = !updates.Busy && !state.Busy;
        download.Visibility = state.Version is not null && state.Status != "ready" && !state.Busy ? Visibility.Visible : Visibility.Collapsed;
        pause.Visibility = state.Busy ? Visibility.Visible : Visibility.Collapsed; pause.IsEnabled = !updates.Busy && state.Status != "verifying";
        install.Visibility = state.Status == "ready" ? Visibility.Visible : Visibility.Collapsed; install.IsEnabled = !updates.Busy && updates.CanInstall;
        if (!updates.CanInstall && state.Status == "ready") ToolTipService.SetToolTip(install, AppLanguage.Text("settings.updateUnsupported"));
        progress.Visibility = state.Busy ? Visibility.Visible : Visibility.Collapsed; progress.IsIndeterminate = state.Status == "verifying"; progress.Value = state.Percent;
        UiMessage? text = state.Busy ? state.Status == "verifying" ? UiMessage.Key("settings.updateVerifying")
            : UiMessage.Key("settings.updateDownloading", new Dictionary<string, object?> { ["percent"] = Math.Round(state.Percent), ["received"] = Bytes(state.ReceivedBytes), ["total"] = Bytes(state.TotalBytes) })
            : updates.Message;
        text ??= state.Status switch {
            "ready" => UiMessage.Key("settings.updateReady", new Dictionary<string, object?> { ["version"] = state.Version }),
            "resumable" => UiMessage.Key("settings.updatePaused", new Dictionary<string, object?> { ["version"] = state.Version }),
            _ => UiMessage.Literal("")
        };
        L.Message(status, TextBlock.TextProperty, text);
        status.Visibility = string.IsNullOrWhiteSpace(text.Render(AppLanguage.Session)) ? Visibility.Collapsed : Visibility.Visible;
        actions.Visibility = download.Visibility == Visibility.Visible || pause.Visibility == Visibility.Visible || install.Visibility == Visibility.Visible
            ? Visibility.Visible : Visibility.Collapsed;
        section.Visibility = status.Visibility == Visibility.Visible || progress.Visibility == Visibility.Visible || actions.Visibility == Visibility.Visible
            ? Visibility.Visible : Visibility.Collapsed;
    }
    private static Border Row(FrameworkElement label,FrameworkElement control)
    {
        var row=new Grid{ColumnSpacing=20};row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});row.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        label.VerticalAlignment=control.VerticalAlignment=VerticalAlignment.Center;control.HorizontalAlignment=HorizontalAlignment.Right;
        row.Children.Add(label);Grid.SetColumn(control,1);row.Children.Add(control);
        return new Border{Style=(Style)Application.Current.Resources["CapSettingsCommandRow"],BorderThickness=new(0),MinHeight=68,Child=row};
    }
    private void Check(){expander.IsExpanded=true;_=updates.CheckAsync();}
    private static string Bytes(long value) => $"{value / 1048576d:0.0} MB";
    private async void Install()
    {
        var dialog = L.Dialog(XamlRoot, "settings.installUpdateNow", "settings.confirmInstallUpdate", "settings.installUpdateNow",ContentDialogButton.Close);
        if (await dialog.ShowAsync() == ContentDialogResult.Primary) await updates.InstallAsync();
    }
}

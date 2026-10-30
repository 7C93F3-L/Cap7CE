using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using L = Cap7CE.WinUI.Localization.LanguageUi;

namespace Cap7CE.WinUI.Controls;

internal sealed class NativeUpdateView : UserControl
{
    private readonly NativeUpdates updates;
    private readonly TextBlock status = new() { TextWrapping = TextWrapping.Wrap };
    private readonly ProgressBar progress = new() { Minimum = 0, Maximum = 100 };
    private readonly Button check, download, pause, install;
    private bool loaded, checkingOnLoad;
    public NativeUpdateView(NativeUpdates updates, bool checkOnLoad)
    {
        this.updates = updates; checkingOnLoad = checkOnLoad;
        check = L.Button("settings.checkForUpdates", () => _ = updates.CheckAsync());
        download = L.Button("settings.downloadUpdateNow", () => _ = updates.DownloadAsync());
        pause = L.Button("settings.pauseUpdate", () => _ = updates.PauseAsync());
        install = L.Button("settings.installUpdateNow", Install);
        var version = L.Text("settings.updateCurrentVersion", parameters: () => new Dictionary<string, object?> { ["version"] = NativeVersion.Text });
        version.VerticalAlignment = VerticalAlignment.Center;
        Content = Ui.Column(Ui.Row(version, check), status, progress, Ui.Row(download, pause, install));
        Loaded += OnLoaded; Unloaded += (_, _) => { loaded = false; updates.Changed -= Refresh; };
    }
    private async void OnLoaded(object sender, RoutedEventArgs args)
    {
        if (loaded) return; loaded = true; updates.Changed += Refresh; Refresh();
        try { await updates.LoadAsync(); if (checkingOnLoad) { checkingOnLoad = false; await updates.CheckAsync(); } }
        catch (Exception error) { NativeDiagnostics.CoreFailure(error.ToString()); if (loaded) L.Message(status, TextBlock.TextProperty, UiMessage.Key("settings.updateCheckFailed")); }
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
    }
    private static string Bytes(long value) => $"{value / 1048576d:0.0} MB";
    private async void Install()
    {
        var dialog = L.Dialog(XamlRoot, "settings.installUpdateNow", "settings.confirmInstallUpdate", "settings.installUpdateNow");
        if (await dialog.ShowAsync() == ContentDialogResult.Primary) await updates.InstallAsync();
    }
}

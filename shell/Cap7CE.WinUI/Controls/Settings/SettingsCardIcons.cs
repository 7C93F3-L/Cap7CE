using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;

// Resource identities stay stable across languages; all glyphs use the native symbol set.
internal static class SettingsCardIcons
{
    public static string Glyph(string title)=>char.ConvertFromUtf32((int)(title switch {
        "ui.tray.enabled"=>Symbol.DockBottom,
        "ui.tray.showStartup"=>Symbol.OpenPane,
        "settings.language"=>Symbol.Globe,
        "settings.launchAtLogin"=>Symbol.Play,
        "settings.systemNotifications"=>Symbol.Message,
        "settings.edgeCollapse"=>Symbol.DockLeft,
        "stableSettings.material"=>Symbol.BrowsePhotos,
        "appearance.themeModeLabel"=>Symbol.Highlight,
        "appearance.configureLabel"=>Symbol.Edit,
        "native.index.title"=>Symbol.Library,
        "native.metadata.title"=>Symbol.Tag,
        "stableSettings.formalCache"=>Symbol.Pictures,
        "settings.quickActions"=>Symbol.Keyboard,
        "settings.quickCommands"=>Symbol.Caption,
        "ui.shortcuts.resetTitle"=>Symbol.Refresh,
        "settings.selectRuntime"=>Symbol.Manage,
        "settings.visionModel"=>Symbol.View,
        "ui.model.serviceTitle"=>Symbol.Play,
        "stableSettings.runtimeInfo"=>Symbol.Help,
        "native.maintenance.title"=>Symbol.Repair,
        "ui.diagnostics.status"=>Symbol.ViewAll,
        "ui.diagnostics.recent"=>Symbol.Clock,
        "ui.diagnostics.path"=>Symbol.Folder,
        "settings.diagnosticsBundle"=>Symbol.Save,
        "settings.versionUpdate"=>Symbol.Sync,
        "stableSettings.license"=>Symbol.Document,
        _=>Symbol.Setting
    }));
}

namespace Cap7CE.WinUI.Models;

internal sealed record SettingsHelpItem(string Command,string DescriptionKey,string? ExampleKey=null);
internal sealed record SettingsHelpGroup(string TitleKey,SettingsHelpItem[] Items,string? HintKey=null);

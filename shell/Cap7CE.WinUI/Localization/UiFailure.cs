namespace Cap7CE.WinUI.Localization;

// Preserve exception categories and diagnostics; localize only at presentation.
internal interface IUiFailure { UiMessage Display {get;} }
internal class UiFailure : IOException,IUiFailure
{
    public UiMessage Display {get;}
    public UiFailure(string key,IReadOnlyDictionary<string,object?>? parameters=null,Exception? inner=null):base(key,inner)
        =>Display=UiMessage.Key(key,parameters);
}
internal sealed class UiDirectoryFailure : DirectoryNotFoundException,IUiFailure
{
    public UiMessage Display {get;}
    public UiDirectoryFailure(string key):base(key)=>Display=UiMessage.Key(key);
}
internal sealed class UiArgumentFailure : ArgumentException,IUiFailure
{
    public UiMessage Display {get;}
    public UiArgumentFailure(string key,string? parameter=null):base(key,parameter)=>Display=UiMessage.Key(key);
}

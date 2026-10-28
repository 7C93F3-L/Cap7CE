namespace Cap7CE.WinUI.Localization;

// UI-thread owner; switching language changes text, never navigation or task state.
internal sealed class LanguageSession(LanguageCatalog catalog)
{
    public string Current {get;private set;}="zh-CN";
    public event Action? Changed;
    public void Select(string preference,string systemLanguage)
    {
        var next=LanguageCatalog.Resolve(preference,systemLanguage);
        if(next==Current)return;
        Current=next;Changed?.Invoke();
    }
    public string Text(string key,IReadOnlyDictionary<string,object?>? parameters=null)=>catalog.Text(key,Current,parameters);
}

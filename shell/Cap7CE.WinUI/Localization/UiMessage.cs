namespace Cap7CE.WinUI.Localization;

// Deferred presentation, not a task callback. Snapshots must be immutable and
// renderers must not perform IO, change application state or query services.
internal sealed class UiMessage
{
    private readonly Func<LanguageSession,string> render;
    private UiMessage(Func<LanguageSession,string> render)=>this.render=render;
    public string Render(LanguageSession language)=>render(language);
    public static UiMessage Literal(string text)=>new(_=>text);
    public static UiMessage Snapshot(Func<LanguageSession,string> format)=>new(format);
    public static UiMessage Key(string key,IReadOnlyDictionary<string,object?>? parameters=null)
    {
        var snapshot=parameters is null?null:new Dictionary<string,object?>(parameters);
        return new(language=>language.Text(key,snapshot?.ToDictionary(pair=>pair.Key,pair=>pair.Value is UiMessage message?message.Render(language):pair.Value)));
    }
    public static implicit operator UiMessage(string text)=>Literal(text);
}

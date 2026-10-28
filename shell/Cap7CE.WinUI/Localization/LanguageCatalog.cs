using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Cap7CE.WinUI.Localization;

// One key owns every language variant. Resource defects fail before UI creation.
internal sealed class LanguageCatalog
{
    private readonly Dictionary<string,Dictionary<string,string>> messages;
    private static readonly Regex Parameter=new(@"\{(?<name>[A-Za-z][A-Za-z0-9]*)(?::(?<format>[^{}]+))?\}",RegexOptions.CultureInvariant);
    public static readonly string[] Languages=["zh-CN","en-US"];
    public LanguageCatalog(string json)
    {
        messages=JsonSerializer.Deserialize<Dictionary<string,Dictionary<string,string>>>(json)??throw new InvalidDataException("Empty language catalog.");
        foreach(var (key,variants) in messages) {
            if(!variants.Keys.Order().SequenceEqual(Languages.Order()))throw new InvalidDataException($"Language variants differ: {key}");
            string[]? expected=null;
            foreach(var language in Languages) {
                var text=variants[language];
                if(string.IsNullOrWhiteSpace(text))throw new InvalidDataException($"Empty translation: {key}/{language}");
                var names=Parameter.Matches(text).Select(m=>m.Value).Order().ToArray();
                if(expected is not null&&!expected.SequenceEqual(names))throw new InvalidDataException($"Translation parameters differ: {key}");
                expected=names;
            }
        }
    }
    public static string Resolve(string preference,string systemLanguage)=>preference switch {
        "zh-CN" or "en-US"=>preference,
        "system"=>systemLanguage.StartsWith("zh",StringComparison.OrdinalIgnoreCase)?"zh-CN":"en-US",
        _=>throw new ArgumentOutOfRangeException(nameof(preference))
    };
    public string Text(string key,string language,IReadOnlyDictionary<string,object?>? parameters=null)
    {
        if(!messages.TryGetValue(key,out var variants))throw new KeyNotFoundException($"Unknown language key: {key}");
        if(!variants.TryGetValue(language,out var template))throw new ArgumentOutOfRangeException(nameof(language));
        return Parameter.Replace(template,match=>{
            var name=match.Groups["name"].Value;
            if(parameters is null||!parameters.TryGetValue(name,out var value))throw new ArgumentException($"Missing translation parameter: {key}/{name}");
            return value is IFormattable formatted?formatted.ToString(match.Groups["format"].Success?match.Groups["format"].Value:null,CultureInfo.GetCultureInfo(language)):value?.ToString()??"";
        });
    }
}

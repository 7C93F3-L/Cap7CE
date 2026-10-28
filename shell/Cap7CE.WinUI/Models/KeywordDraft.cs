using Cap7CE.WinUI.Localization;
namespace Cap7CE.WinUI.Models;

internal sealed class KeywordDraft
{
    private string[] original=[];
    private readonly List<string> words=[];
    public IReadOnlyList<string> Words=>words;
    public string Input {get;set;}="";
    public bool Dirty=>!string.IsNullOrWhiteSpace(Input)||!words.SequenceEqual(original,StringComparer.Ordinal);
    public void Reset(IEnumerable<string> values){original=values.ToArray();words.Clear();words.AddRange(original);Input="";}
    public void Remove(string word)=>words.Remove(word);
    public void Clear(){words.Clear();Input="";}
    public void Cancel()=>Reset(original);
    public string[] SaveWords()
    {
        var result=words.Concat(Input.Split([',','，','\r','\n'],StringSplitOptions.RemoveEmptyEntries))
            .Select(word=>word.Trim()).Where(word=>word.Length>0).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if(result.Length>128||result.Any(word=>word.Length>256||word.Any(char.IsControl))||string.Join(',',result).Length>32000)
            throw new UiFailure("ui.error.keywordLimit");
        return result;
    }
}

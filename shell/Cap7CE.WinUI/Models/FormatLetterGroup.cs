namespace Cap7CE.WinUI.Models;

[Microsoft.UI.Xaml.Data.Bindable]
public sealed class FormatLetterGroup(string key, IEnumerable<string> extensions) : List<string>(extensions)
{
    public string Key { get; } = key;

    public static IReadOnlyList<FormatLetterGroup> Create(IEnumerable<string> extensions)
    {
        var values=extensions.Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToArray();
        return new[]{"#"}.Concat(Enumerable.Range('A',26).Select(letter=>((char)letter).ToString()))
            .Select(key=>new FormatLetterGroup(key,values.Where(extension=>Initial(extension)==key))).ToArray();
    }

    private static string Initial(string extension)
    {
        var name=extension.TrimStart('.');
        return name.Length>0 && char.ToUpperInvariant(name[0]) is >= 'A' and <= 'Z'
            ? char.ToUpperInvariant(name[0]).ToString() : "#";
    }
}

namespace Cap7CE.WinUI.Models;

internal sealed record KeywordFileSnapshot<T>(T Item,ManualKeywords Value);
internal sealed record KeywordSelectionSnapshot<T>(string[] Words,IReadOnlyList<KeywordFileSnapshot<T>> Files);
internal sealed record KeywordSelectionSaveResult<T>(KeywordSelectionSnapshot<T> Snapshot,int Succeeded,int Failed);
internal sealed record ManualKeywordSaveResult(bool Saved,ManualKeywords Current);

internal static class KeywordBatchPolicy
{
    public static string[] Common(IEnumerable<string[]> values)
    {
        var snapshots=values.ToArray();if(snapshots.Length==0)return [];
        return snapshots[0].Distinct(StringComparer.OrdinalIgnoreCase).Where(word=>snapshots.Skip(1).All(words=>words.Contains(word,StringComparer.OrdinalIgnoreCase))).ToArray();
    }
    public static string[] Apply(string[] existing,string[] common,string[] target)
    {
        var removed=common.Except(target,StringComparer.OrdinalIgnoreCase).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var added=target.Except(common,StringComparer.OrdinalIgnoreCase);
        var draft=new KeywordDraft();draft.Reset(existing.Where(word=>!removed.Contains(word)).Concat(added));
        return draft.SaveWords();
    }
}

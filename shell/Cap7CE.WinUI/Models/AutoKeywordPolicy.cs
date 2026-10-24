namespace Cap7CE.WinUI.Models;

internal static class AutoKeywordPolicy
{
    public static string[] Merge(IEnumerable<string> existing,IEnumerable<string> generated)
    {
        var words=generated.Select(word=>word.Trim()).Where(word=>word.Length>0).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if(words.Length is 0 or >20||words.Any(word=>word.Length>64||word.Any(char.IsControl)))throw new IOException("模型未返回有效关键词，请重试。");
        var merged=existing.Concat(words).Select(word=>word.Trim()).Where(word=>word.Length>0).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if(merged.Length>128||string.Join(',',merged).Length>32000)throw new IOException("现有关键词已接近数量上限，请整理后重试。");
        return merged;
    }
}
internal sealed record AutoKeywordState(string Phase="待开始",string Name="",int Total=0,int Processed=0,int Succeeded=0,int Failed=0,int Skipped=0,string Message="");

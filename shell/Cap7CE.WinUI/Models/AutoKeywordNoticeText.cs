namespace Cap7CE.WinUI.Models;

internal static class AutoKeywordNoticeText
{
    public static string Finished(AutoKeywordState state)
    {
        if(state.Phase=="已取消")return "识别已取消";
        if(state.Phase=="失败")return "识别失败"+(state.Message.Length>0?" · "+state.Message:"");
        var failures=state.Failed+state.Skipped;
        return failures>0?$"{failures} 个文件识别失败":$"识别完成：{state.Succeeded} 项";
    }
}

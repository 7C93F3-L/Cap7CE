using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

internal static class AutoKeywordWriter
{
    public static async Task SaveAsync(string[] generated,string original,Func<CancellationToken,Task<ManualKeywords>> read,
        Func<CancellationToken,Task<string>> fingerprint,Func<string[],string?,Task<bool>> save,CancellationToken token)
    {
        for(var attempt=0;attempt<3;attempt++) {
            token.ThrowIfCancellationRequested();var current=await read(token);
            if(await fingerprint(token)!=original)throw new IOException("文件已发生变化，请重新选择文件后重试。");
            var words=AutoKeywordPolicy.Merge(current.Words,generated);token.ThrowIfCancellationRequested();
            // Once Core commits, report success even if cancellation arrived during this write.
            if(await save(words,current.Revision))return;
        }
        throw new IOException("关键词正在被其他操作修改，请稍后重试。");
    }
}

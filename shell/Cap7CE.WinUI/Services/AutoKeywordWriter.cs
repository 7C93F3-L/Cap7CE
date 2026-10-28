using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

internal static class AutoKeywordWriter
{
    public static async Task SaveAsync(string[] generated,string original,Func<CancellationToken,Task<ManualKeywords>> read,
        Func<CancellationToken,Task<string>> fingerprint,Func<string[],string?,Task<bool>> save,CancellationToken token)
    {
        for(var attempt=0;attempt<3;attempt++) {
            token.ThrowIfCancellationRequested();var current=await read(token);
            if(await fingerprint(token)!=original)throw new UiFailure("ui.error.sourceChanged");
            var words=AutoKeywordPolicy.Merge(current.Words,generated);token.ThrowIfCancellationRequested();
            // Once Core commits, report success even if cancellation arrived during this write.
            if(await save(words,current.Revision))return;
        }
        throw new UiFailure("ui.error.keywordConflict");
    }
}

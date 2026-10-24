using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;

internal static class KeywordBatchChecks
{
    public static async Task RunAsync()
    {
        void Require(bool value,string message){if(!value)throw new Exception(message);}
        Require(KeywordBatchPolicy.Common([["共同","独有A"],["共同","独有B"]]).SequenceEqual(["共同"]),"Only shared words are exposed by multiselect");
        Require(KeywordBatchPolicy.Apply(["共同","独有A","并发新增"],["共同"],["新增"]).SequenceEqual(["独有A","并发新增","新增"]),"Batch delta preserves unique and concurrently added words");
        Require(KeywordBatchPolicy.Apply(["共同","独有A"],["共同"],[]).SequenceEqual(["独有A"]),"Clear removes common words only");
        var original=new KeywordSelectionSnapshot<int>(["共同"],[new(1,new(["共同","独有A"],"1")),new(2,new(["共同","独有B"],"1"))]);
        var attempts=new System.Collections.Concurrent.ConcurrentDictionary<int,int>();
        var saved=new System.Collections.Concurrent.ConcurrentDictionary<int,string[]>();
        var result=await KeywordSelectionWriter.SaveAsync(original,["新增"],(id,words,revision)=>{
            var attempt=attempts.AddOrUpdate(id,1,(_,count)=>count+1);
            if(id==1&&attempt==1)return Task.FromResult(new ManualKeywordSaveResult(false,new(["共同","独有A","并发新增"],"2")));
            if(id==1)Require(revision=="2","Conflict retries must use the returned revision");
            saved[id]=words;return Task.FromResult(new ManualKeywordSaveResult(true,new(words,"3")));
        },default);
        Require(result.Succeeded==2&&result.Failed==0&&result.Snapshot.Words.SequenceEqual(["新增"]),"Successful save returns new common words");
        Require(saved[1].SequenceEqual(["独有A","并发新增","新增"])&&saved[2].SequenceEqual(["独有B","新增"]),"Every file retains its individual keywords");
        var partial=await KeywordSelectionWriter.SaveAsync(original,["新增"],(id,words,revision)=>id==2?throw new IOException("replaced"):Task.FromResult(new ManualKeywordSaveResult(true,new(words,"2"))),default);
        Require(partial.Succeeded==1&&partial.Failed==1&&original.Words.SequenceEqual(["共同"]),"Partial failure preserves the original editor snapshot for retry");
        attempts.Clear();
        var conflicts=await KeywordSelectionWriter.SaveAsync(original,[],(id,words,revision)=>{attempts.AddOrUpdate(id,1,(_,count)=>count+1);return Task.FromResult(new ManualKeywordSaveResult(false,new(["共同"],"2")));},default);
        Require(conflicts.Failed==2&&attempts.Values.All(count=>count==3),"Conflicts are bounded to three attempts per file");
        using var cancel=new CancellationTokenSource();cancel.Cancel();
        try{await KeywordSelectionWriter.SaveAsync(original,[],(_,_,_)=>throw new Exception("Cancelled write started"),cancel.Token);throw new Exception("Cancellation ignored");}catch(OperationCanceledException){}
        Require(AutoKeywordNoticeText.Finished(new("完成",Failed:1,Skipped:2))=="3 个文件识别失败","Unsupported formats are counted in the compact failure notice");
        Console.WriteLine("Batch keyword checks passed (common/delta, unique words, conflicts, partial results, cancellation and unsupported recognition summary).");
    }
}

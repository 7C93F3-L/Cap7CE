using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;

internal static class AutoKeywordChecks
{
    public static async Task RunAsync()
    {
        void Require(bool value,string message){if(!value)throw new Exception(message);}
        Require(AutoKeywordPolicy.Merge(["手动","BLUE"],[" 蓝色 ","blue","蓝色"]).SequenceEqual(["手动","BLUE","蓝色"]),"Generated words merge without erasing manual words or duplicating case/whitespace");
        foreach(var invalid in new[]{Array.Empty<string>(),new[]{"bad\nword"},new[]{new string('a',65)},Enumerable.Range(0,21).Select(i=>i.ToString()).ToArray()}) {
            try{AutoKeywordPolicy.Merge([],invalid);throw new Exception("Invalid model output accepted");}catch(IOException){}
        }
        var reads=0;var writes=0;string[] saved=[];string? revision=null;
        await AutoKeywordWriter.SaveAsync(["AI"],"same",
            _=>Task.FromResult(++reads==1?new ManualKeywords(["原词"],"1"):new ManualKeywords(["原词","并发新增"],"2")),
            _=>Task.FromResult("same"),(words,expected)=>{saved=words;revision=expected;return Task.FromResult(++writes==2);},default);
        Require(reads==2&&writes==2&&revision=="2"&&saved.SequenceEqual(["原词","并发新增","AI"]),"Revision conflict rereads and preserves concurrent changes");
        writes=0;
        try{await AutoKeywordWriter.SaveAsync(["AI"],"old",_=>Task.FromResult(new ManualKeywords([],null)),_=>Task.FromResult("replaced"),(_,_)=>{writes++;return Task.FromResult(true);},default);throw new Exception("Changed source accepted");}catch(IOException){}
        Require(writes==0,"Changed source never reaches keyword write");
        using var cancellation=new CancellationTokenSource();cancellation.Cancel();
        try{await AutoKeywordWriter.SaveAsync(["AI"],"same",_=>throw new Exception("Read after cancellation"),_=>Task.FromResult("same"),(_,_)=>Task.FromResult(true),cancellation.Token);throw new Exception("Cancellation ignored");}catch(OperationCanceledException){}
        using var duringSave=new CancellationTokenSource();
        await AutoKeywordWriter.SaveAsync(["AI"],"same",_=>Task.FromResult(new ManualKeywords([],null)),_=>Task.FromResult("same"),(_,_)=>{duringSave.Cancel();return Task.FromResult(true);},duringSave.Token);
        writes=0;
        try{await AutoKeywordWriter.SaveAsync(["AI"],"same",_=>Task.FromResult(new ManualKeywords([],null)),_=>Task.FromResult("same"),(_,_)=>{writes++;return Task.FromResult(false);},default);throw new Exception("Conflicts silently accepted");}catch(IOException){}
        Require(writes==3,"Conflicting writes stop after three attempts");
        Console.WriteLine("Auto keyword checks passed (merge, invalid output, revision conflict, changed source, cancellation and committed writes).");
    }
}

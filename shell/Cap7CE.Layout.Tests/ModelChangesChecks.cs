using Cap7CE.WinUI.Services;
internal static class ModelChangesChecks
{
    public static async Task RunAsync()
    {
        var changes=new ModelChanges();var observed=new List<bool>();
        void Changed()=>observed.Add(changes.Busy);
        changes.Changed+=Changed;
        var first=new TaskCompletionSource<int>();var second=new TaskCompletionSource<int>();
        var one=changes.RunAsync(()=>first.Task);var two=changes.RunAsync(()=>second.Task);
        if(!changes.Busy)throw new Exception("All entries share in-flight model activity.");
        first.SetResult(1);if(await one!=1||!changes.Busy)throw new Exception("One completion cannot enable controls while another operation is pending.");
        second.SetException(new IOException("fixture"));
        try{await two;throw new Exception("Failure must propagate.");}catch(IOException){}
        if(changes.Busy||!observed.SequenceEqual(new[]{true,true,true,false}))throw new Exception("Failure must release busy and notify a final refresh.");
        try{await changes.RunAsync<int>(()=>throw new IOException("synchronous fixture"));}catch(IOException){}
        if(changes.Busy||observed[^1])throw new Exception("Synchronous failures must also release state.");
        changes.Changed-=Changed;var count=observed.Count;
        await changes.RunAsync(()=>Task.FromResult(3));
        if(observed.Count!=count)throw new Exception("An unloaded subscriber must not receive further changes.");
        Console.WriteLine("Shared model mutation activity: overlap, result, failure, synchronous failure and unsubscribe passed (isolated tasks).");
    }
}

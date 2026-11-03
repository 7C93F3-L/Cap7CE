using Cap7CE.WinUI.Services;
internal static class DeletedPathChecks
{
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    public static async Task RunAsync()
    {
        var root=Path.Combine(Path.GetTempPath(),"Cap7CE-restore-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try {
            var file=Path.Combine(root,"restored.txt");var folder=Path.Combine(root,"folder");
            var tracker=new DeletedPathTracker();tracker.UnionWith([file,folder]);
            await tracker.ReconcileAsync(CancellationToken.None);
            Check(tracker.Count()==2,"absent paths retain suppression");
            await File.WriteAllTextAsync(file,"owned fixture");Directory.CreateDirectory(folder);
            await tracker.ReconcileAsync(CancellationToken.None);
            Check(!tracker.Any(),"restored file and folder release suppression");
            tracker.Add(file);File.Delete(file);await tracker.ReconcileAsync(CancellationToken.None);
            Check(tracker.Contains(file),"second deletion is independent of the first restoration");
            using var started=new ManualResetEventSlim();using var resume=new ManualResetEventSlim();
            var concurrent=new DeletedPathTracker(_=>{started.Set();resume.Wait();return true;});concurrent.Add(file);
            var checking=concurrent.ReconcileAsync(CancellationToken.None);
            Check(started.Wait(TimeSpan.FromSeconds(5)),"background probe starts");
            concurrent.Add(file);resume.Set();await checking;
            Check(concurrent.Contains(file),"older restoration observation cannot clear a newer deletion");
            using var cancel=new CancellationTokenSource();cancel.Cancel();
            try {await concurrent.ReconcileAsync(cancel.Token);throw new Exception("cancellation ignored");}
            catch(OperationCanceledException){}
            Check(concurrent.Contains(file),"cancelled reconciliation preserves suppression");
        } finally { Directory.Delete(root,true); }
        Console.WriteLine("Deleted paths: missing, restored file/folder, repeat deletion, stale observation and cancellation passed.");
    }
}

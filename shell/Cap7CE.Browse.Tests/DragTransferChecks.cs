using Cap7CE.WinUI.Services;
internal static class DragTransferChecks
{
    public static async Task RunAsync()
    {
        void Check(bool value,string message){if(!value)throw new Exception(message);}
        async Task Canceled(Task task){try{await task;throw new Exception("Expected canceled transfer");}catch(OperationCanceledException){}}
        using(var lifetime=new DragRequestLifetime()){
            lifetime.Complete(true);
            Check(await lifetime.ReadAsync(_=>Task.FromResult(7),DateTimeOffset.UtcNow.AddSeconds(5))==7,"Accepted drops retain data access after the drag loop completes");
            lifetime.Complete(false);var called=false;
            await Canceled(lifetime.ReadAsync(_=>{called=true;return Task.FromResult(1);},DateTimeOffset.UtcNow.AddSeconds(5)));
            Check(!called,"Canceled drags never start a late target request");
        }
        using(var lifetime=new DragRequestLifetime()){
            var called=false;
            try{await lifetime.ReadAsync(_=>{called=true;return Task.FromResult(1);},DateTimeOffset.UtcNow);throw new Exception("Expected expired deadline");}catch(TimeoutException){}
            Check(!called,"Expired system deadlines do not begin filesystem work");
            var started=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var request=lifetime.ReadAsync(async token=>{started.SetResult();await Task.Delay(Timeout.Infinite,token);return 1;},DateTimeOffset.UtcNow.AddSeconds(5));
            await started.Task;lifetime.Complete(false);await Canceled(request);
        }
        using(var entered=new ManualResetEventSlim())using(var release=new ManualResetEventSlim())using(var lifetime=new DragRequestLifetime(TimeSpan.FromMilliseconds(100))){
            Task<IReadOnlyList<int>>? worker=null;var resolved=false;var progress=new FileTransferProgress();
            try {
                var request=lifetime.ReadAsync(token=>worker=FileTransferRead.RunAsync<int,int>([1],_=>{entered.Set();release.Wait();},
                    (item,_)=>{resolved=true;return Task.FromResult(item);},token,progress),DateTimeOffset.UtcNow.AddSeconds(5));
                Check(entered.Wait(2000),"Native validation begins on a worker while the calling thread remains available");
                await Canceled(request.WaitAsync(TimeSpan.FromSeconds(2)));
                Check(progress.Stage=="validating"&&!resolved,"Request timeout returns even while a synchronous native check is blocked");
            }finally{release.Set();if(worker is not null)await Canceled(worker);}
            Check(!resolved,"A late filesystem check cannot proceed to resolve or deliver canceled data");
        }
        var calls=0;
        try{await FileTransferRead.RunAsync<int,int>([1],_=>throw new IOException("Identity changed"),(item,_)=>{calls++;return Task.FromResult(item);},default);throw new Exception("Expected validation failure");}catch(IOException){}
        Check(calls==0,"Failed identity checks never resolve or publish storage items");
        var snapshot=new[]{1,2};using(var entered=new ManualResetEventSlim())using(var release=new ManualResetEventSlim()){
            try {
                var result=FileTransferRead.RunAsync<int,int>(snapshot,_=>{entered.Set();release.Wait();},(item,_)=>Task.FromResult(item),default);
                Check(entered.Wait(2000),"Snapshot validation started");snapshot[1]=99;release.Set();
                Check((await result).SequenceEqual(new[]{1,2}),"Selection mutation cannot alter an in-flight drag snapshot");
            }finally{release.Set();}
        }
        Console.WriteLine("Drag transfer deadlines, blocked native IO, off-thread validation, cancellation, late completion, accepted-drop lifetime and immutable selection checks passed.");
    }
}

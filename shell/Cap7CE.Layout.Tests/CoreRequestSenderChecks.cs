using System.Text.Json;
using Cap7CE.Core.Host;
using Cap7CE.WinUI.Services;

internal static class CoreRequestSenderChecks
{
    public static async Task RunAsync()
    {
        var sender=new CoreRequestSender();var tracker=new CoreRequestIdentityTracker();var count=0;
        using var reply=JsonDocument.Parse("{}");
        await Task.WhenAll(Enumerable.Range(0,5000).Select(_=>Task.Run(async()=>{
            var request=await sender.StartAsync(id=>{
                if(tracker.Register(id)!=CoreRequestIdentityResult.Accepted)throw new Exception("Concurrent WinUI requests must enter Core in ordinal order beyond 4096 requests");
                count++;return Task.FromResult(reply.RootElement.Clone());
            },CancellationToken.None);
            await request.Response;
        })));
        if(count!=5000||tracker.RetainedIdentityCount!=0)throw new Exception("Long sessions must not retain opaque request IDs");
        using var cancelled=new CancellationTokenSource();cancelled.Cancel();
        try{await sender.StartAsync(_=>throw new Exception("Cancelled request cannot send"),cancelled.Token);throw new Exception("Expected cancellation");}catch(OperationCanceledException){}
        var next=await sender.StartAsync(id=>{
            if(tracker.Register(id)!=CoreRequestIdentityResult.Accepted)throw new Exception("Sender remains usable after cancellation");
            return Task.FromResult(reply.RootElement.Clone());
        },CancellationToken.None);await next.Response;
        Console.WriteLine("Core sender checks passed: 5000 concurrent ordered requests, no retained opaque IDs and cancellation recovery.");
    }
}

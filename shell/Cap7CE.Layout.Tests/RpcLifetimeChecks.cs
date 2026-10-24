using System.Buffers.Binary;
using System.IO.Pipes;
using System.Text;
using Cap7CE.WinUI.Services;

internal static class RpcLifetimeChecks
{
    public static async Task RunAsync()
    {
        var name="cap7ce-rpc-test-"+Guid.NewGuid().ToString("N");
        await using var server=new NamedPipeServerStream(name,PipeDirection.Out,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous);
        await using var client=new NamedPipeClientStream(".",name,PipeDirection.In,PipeOptions.Asynchronous);
        await Task.WhenAll(server.WaitForConnectionAsync(),client.ConnectAsync());
        await using var rpc=new FramedRpc(client,new MemoryStream(),4096);
        using var canceled=new CancellationTokenSource();canceled.Cancel();
        try{await rpc.RequestAsync("cancel",new{},canceled.Token);throw new Exception("Expected caller cancellation");}
        catch(OperationCanceledException)when(canceled.IsCancellationRequested){}
        if(!rpc.IsConnected)throw new Exception("Caller cancellation must not disconnect the transport");
        var request=rpc.RequestAsync("healthy",new{},CancellationToken.None);
        var response=Encoding.UTF8.GetBytes("{\"requestId\":\"healthy\",\"status\":\"success\"}");
        var header=new byte[4];BinaryPrimitives.WriteInt32LittleEndian(header,response.Length);
        await server.WriteAsync(header);await server.WriteAsync(response);await server.FlushAsync();
        if((await request.WaitAsync(TimeSpan.FromSeconds(2))).GetProperty("status").GetString()!="success")throw new Exception("Healthy response failed");
        var interrupted=rpc.RequestAsync("interrupted",new{},CancellationToken.None);
        server.Dispose();
        try{await interrupted.WaitAsync(TimeSpan.FromSeconds(2));throw new Exception("Expected interrupted request to fail");}
        catch(IOException){}
        if(rpc.IsConnected)throw new Exception("EOF must mark the transport disconnected");
        try{await rpc.RequestAsync("after-exit",new{},CancellationToken.None);throw new Exception("Expected disconnected request to fail");}
        catch(IOException){}
        Console.WriteLine("RPC lifetime passed: healthy replies, caller cancellation, interrupted request and post-exit IOException instead of silent cancellation.");
    }
}

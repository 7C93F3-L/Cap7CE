using Cap7CE.WinUI.Localization;
using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;

// Multiplexed bounded frames; one reader and serialized writes for both existing Core transports.
internal sealed class FramedRpc : IAsyncDisposable
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly Stream input, output;
    private readonly int maximum;
    private readonly CancellationTokenSource ended = new();
    private readonly ConcurrentDictionary<string, TaskCompletionSource<JsonElement>> pending = new();
    private readonly SemaphoreSlim writing = new(1);
    private readonly Task reading;
    public bool IsConnected=>!ended.IsCancellationRequested;
    public FramedRpc(Stream input, Stream output, int maximum)
    {
        this.input = input; this.output = output; this.maximum = maximum;
        reading = ReadAsync();
    }
    public async Task<JsonElement> RequestAsync(string id, object request, CancellationToken token)
    {
        if(!IsConnected)throw new UiFailure("ui.error.coreDisconnected");
        if (pending.Count >= 32) throw new UiFailure("ui.error.rpcQueue");
        var completion = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!pending.TryAdd(id, completion)) throw new InvalidOperationException("Duplicate request");
        try
        {
            var payload = JsonSerializer.SerializeToUtf8Bytes(request, Json);
            if (payload.Length > maximum) throw new UiFailure("ui.error.rpcRequest");
            await writing.WaitAsync(token);
            try
            {
                var header = new byte[4]; BinaryPrimitives.WriteInt32LittleEndian(header, payload.Length);
                // A cancelled caller must never leave a partial frame in the shared transport.
                await output.WriteAsync(header, ended.Token); await output.WriteAsync(payload, ended.Token);
                await output.FlushAsync(ended.Token);
            }
            finally { writing.Release(); }
            return await completion.Task.WaitAsync(token);
        }
        catch(OperationCanceledException)when(!token.IsCancellationRequested&&!IsConnected)
        {throw new UiFailure("ui.error.coreDisconnected");}
        finally { pending.TryRemove(id, out _); }
    }
    private async Task ReadAsync()
    {
        try
        {
            while (true)
            {
                var header = new byte[4]; await input.ReadExactlyAsync(header, ended.Token);
                var length = BinaryPrimitives.ReadInt32LittleEndian(header);
                if (length < 2 || length > maximum) throw new UiFailure("ui.error.rpcResponse");
                var payload = new byte[length]; await input.ReadExactlyAsync(payload, ended.Token);
                using var document = JsonDocument.Parse(payload);
                var value = document.RootElement;
                var id = value.TryGetProperty("requestId", out var requestId) ? requestId.GetString()! : value.GetProperty("id").ToString();
                if (pending.TryRemove(id, out var completion)) completion.TrySetResult(value.Clone());
            }
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            ended.Cancel();
            foreach (var completion in pending.Values) completion.TrySetException(new UiFailure("ui.error.rpcEnded", inner:error));
            pending.Clear();
        }
    }
    public async ValueTask DisposeAsync()
    {
        ended.Cancel(); input.Dispose(); if (!ReferenceEquals(input, output)) output.Dispose();
        await reading;
    }
}

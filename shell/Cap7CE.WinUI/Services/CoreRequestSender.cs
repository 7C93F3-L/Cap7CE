using System.Globalization;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;

// Allocate ordered identities in the same order that RPC frames enter the writer.
internal sealed class CoreRequestSender
{
    private readonly SemaphoreSlim sending=new(1);
    private readonly string nonce=Guid.NewGuid().ToString("N")[..8];
    private long ordinal;
    public async Task<(string Id,Task<JsonElement> Response)> StartAsync(Func<string,Task<JsonElement>> send,CancellationToken token)
    {
        await sending.WaitAsync(token);
        try {
            token.ThrowIfCancellationRequested();
            var id="shell-"+(++ordinal).ToString(CultureInfo.InvariantCulture)+"-"+nonce;
            return(id,send(id));
        }finally{sending.Release();}
    }
}

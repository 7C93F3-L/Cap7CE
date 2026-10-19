using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.MetadataBuildHosting;

// Stop/control does not queue behind content search. One bounded control slot on the existing pipe.
internal sealed class MetadataBuildControlDispatch
{
    private readonly SemaphoreSlim slot = new(1, 1);
    internal async Task<CoreResponseEnvelope> DispatchAsync(MetadataBuildService service, CoreRequestEnvelope request, CancellationToken token)
    {
        await slot.WaitAsync(token);
        try { return await MetadataBuildRequestHandler.DispatchAsync(service, request, token); }
        finally { slot.Release(); }
    }
}

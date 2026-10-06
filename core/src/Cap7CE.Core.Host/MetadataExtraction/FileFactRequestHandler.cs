using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.MetadataExtraction;

internal static class FileFactRequestHandler
{
    public static bool Supports(string operation) => CoreOperations.FileFactCapabilities.Contains(operation, StringComparer.Ordinal);

    public static async Task<CoreResponseEnvelope> DispatchAsync(FileFactHostSession session,
        CoreRequestEnvelope request, CancellationToken token)
    {
        try
        {
            object response;
            switch (request.Operation)
            {
                case CoreOperations.FileFactConfigure:
                    response = await session.ConfigureAsync(CoreRequestDispatcher.ReadBody<FileFactConfigurationRequest>(request), token); break;
                case CoreOperations.FileFactDiscover:
                    response = await session.DiscoverAsync(CoreRequestDispatcher.ReadBody<FileFactDiscoveryRequest>(request), token); break;
                case CoreOperations.FileFactConsumeChanges:
                    response = await session.ConsumeChangesAsync(CoreRequestDispatcher.ReadBody<FileFactConsumeChangesRequest>(request), token); break;
                case CoreOperations.FileFactClaim:
                    response = await session.ClaimAsync(token, CoreRequestDispatcher.ReadBody<FileFactClaimRequest>(request).Specification); break;
                case CoreOperations.FileFactPause:
                    CoreRequestDispatcher.RequireEmptyBody(request);
                    response = await session.PauseAsync(token); break;
                case CoreOperations.FileFactRenew:
                    response = new { renewed = await session.RenewAsync(CoreRequestDispatcher.ReadBody<FileFactLeaseRequest>(request), token) }; break;
                case CoreOperations.FileFactComplete:
                    response = new { completion = await session.CompleteAsync(CoreRequestDispatcher.ReadBody<FileFactCompleteRequest>(request), token) }; break;
                case CoreOperations.FileFactStatus:
                    response = await session.ReadStatusAsync(CoreRequestDispatcher.ReadBody<FileFactQueueStatusRequest>(request), token); break;
                default: throw new CoreProtocolException(CoreErrorCodes.UnknownOperation, "Extraction operation is not supported.");
            }
            return CoreResponseEnvelope.Success(request.RequestId, 0, response);
        }
        catch (ArgumentException) { throw new CoreProtocolException(CoreErrorCodes.InvalidRequest, "Extraction parameters are invalid."); }
    }
}

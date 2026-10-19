using System.Text.Json;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataBuild;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.MetadataScheduling;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.MetadataBuildHosting;

public sealed record MetadataBuildReply(object? Result, string? ErrorCode = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] MetadataDirectoryStorageError? StorageError = null);
internal static class MetadataBuildRequestHandler
{
    private sealed record PolicyRequest(FileFactQueuePolicy Policy);
    private sealed record ConfirmationRequest(bool AllowMetadataExtraction);
    public static bool Supports(string operation) => MetadataBuildOperations.All.Contains(operation, StringComparer.Ordinal);
    public static async Task<CoreResponseEnvelope> DispatchAsync(MetadataBuildService service, CoreRequestEnvelope request, CancellationToken token)
    {
        MetadataBuildReply reply;
        try {
            object result;
            if (request.Operation == MetadataBuildOperations.Attach) { CoreRequestDispatcher.RequireEmptyBody(request); await service.AttachAsync(token); result = new { attached = true }; }
            else if (request.Operation == MetadataBuildOperations.Shutdown) { CoreRequestDispatcher.RequireEmptyBody(request); await service.ShutdownAsync().WaitAsync(token); result = new { accepted = true }; }
            else {
                var owner = await service.GetAsync(token);
                switch (request.Operation) {
                    case MetadataBuildOperations.Status: CoreRequestDispatcher.RequireEmptyBody(request); result = await owner.ReadAsync(token); break;
                    case MetadataBuildOperations.ResolveScope: result = await owner.ResolveScopeAsync(CoreRequestDispatcher.ReadBody<CatalogResolveScopeRequest>(request).Path, token); break;
                    case MetadataBuildOperations.SavePolicy: result = await owner.SavePolicyAsync(CoreRequestDispatcher.ReadBody<PolicyRequest>(request).Policy, token); break;
                    case MetadataBuildOperations.Start: result = await owner.StartAsync(CoreRequestDispatcher.ReadBody<FileFactConfigurationRequest>(request), token); break;
                    case MetadataBuildOperations.Pause: CoreRequestDispatcher.RequireEmptyBody(request); result = await owner.PauseAsync(); break;
                    case MetadataBuildOperations.Resume: CoreRequestDispatcher.RequireEmptyBody(request); result = await owner.ResumeAsync(token); break;
                    case MetadataBuildOperations.StartDirectory: result = await owner.StartDirectoryAsync(CoreRequestDispatcher.ReadBody<MetadataDirectoryBuildRequest>(request), token); break;
                    case MetadataBuildOperations.StartAllVolumes: result = await owner.StartAllVolumesAsync(CoreRequestDispatcher.ReadBody<ConfirmationRequest>(request).AllowMetadataExtraction, token); break;
                    case MetadataBuildOperations.CancelDirectories: CoreRequestDispatcher.RequireEmptyBody(request); result = await owner.CancelDirectoriesAsync(); break;
                    case MetadataBuildOperations.Restore: CoreRequestDispatcher.RequireEmptyBody(request); await owner.RestoreAsync(token); result = new { accepted = true }; break;
                    case MetadataBuildOperations.Notify: CoreRequestDispatcher.RequireEmptyBody(request); _ = ObserveWakeAsync(owner); result = new { accepted = true }; break;
                    default: throw new InvalidOperationException("metadata-build-invalid-request");
                }
            }
            reply = new(result);
        }
        catch (MetadataDirectoryStateException error) { reply = new(null, error.Message, error.Details); }
        catch (Exception error) when (error is not (OutOfMemoryException or OperationCanceledException)) {
            var message = error.Message;
            reply = new(null, System.Text.RegularExpressions.Regex.IsMatch(message, "^metadata-[a-z-]{1,100}$") ? message
                : error is JsonException or ArgumentException or CoreProtocolException ? "metadata-build-invalid-request"
                : error is IOException ? "metadata-build-preferences-unavailable" : "metadata-build-failed");
        }
        return CoreResponseEnvelope.Success(request.RequestId, 0, reply);
    }
    private static async Task ObserveWakeAsync(MetadataBuildCoordinator owner)
    {
        try { await owner.NotifyCatalogChangeAsync(); } catch (Exception error) when (error is not OutOfMemoryException) { }
    }
}

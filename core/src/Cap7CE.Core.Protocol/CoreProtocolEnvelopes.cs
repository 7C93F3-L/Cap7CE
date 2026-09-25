using System.Text.Json;

namespace Cap7CE.Core.Protocol;

public sealed record CoreRequestEnvelope(
    int ProtocolVersion,
    string RequestId,
    string Operation,
    int DeadlineMs,
    JsonElement Body);

public sealed record CoreProtocolError(
    string Code,
    string Stage,
    bool Retryable,
    string Message);

public sealed record CoreResponseEnvelope(
    int ProtocolVersion,
    string RequestId,
    string Status,
    long CatalogRevision,
    JsonElement? Body,
    CoreProtocolError? Error)
{
    public static CoreResponseEnvelope Success<T>(string requestId, long catalogRevision, T body) => new(
        CoreProtocol.CurrentVersion,
        requestId,
        CoreResponseStatuses.Success,
        catalogRevision,
        CoreProtocolJson.ToElement(body),
        null);

    public static CoreResponseEnvelope Failure(
        string requestId,
        long catalogRevision,
        string code,
        string stage,
        bool retryable,
        string message) => new(
            CoreProtocol.CurrentVersion,
            requestId,
            CoreResponseStatuses.Error,
            catalogRevision,
            null,
            new CoreProtocolError(code, stage, retryable, message));
}

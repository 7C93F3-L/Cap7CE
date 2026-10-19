using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Protocol;
using System.Text.Json;

namespace Cap7CE.Core.Host.MetadataExtraction;

public sealed record FileFactConfigurationRequest(bool AllowMetadataExtraction, FileFactQueuePolicy Policy);
public sealed record FileFactDiscoveryRequest(FileFactKind Kind, int ExtractorVersion,
    IReadOnlyList<string> Extensions, FileFactDiscoveryCursor? After = null, int PageSize = 128, string? VolumeId = null);
public sealed record FileFactConsumeChangesRequest(IReadOnlyList<FileFactChangeSpecification> Specifications, int PageSize = 128);
public sealed record FileFactClaimRequest(FileFactClaimSpecification? Specification = null);
public sealed record FileFactLeaseRequest(string LeaseId);
public sealed record FileFactCompleteRequest(string LeaseId, FileFactExtractionResult Result);
public sealed record FileFactQueueStatusRequest(FileFactKind Kind, int ExtractorVersion, string? VolumeId = null);
public sealed record FileFactHostStatus(string State, FileFactQueueLedger? Ledger = null);

// Host session remains inactive until explicit extraction configuration.
// A rebuildable fresh store needs no historical migration; assemblers may retain a private checkpoint.
public sealed class FileFactHostSession : IAsyncDisposable
{
    private readonly FileFactExtractionBroker broker;
    private readonly string databasePath;
    private readonly FileFactDiscovery discovery;
    private readonly FileFactQueueDiagnostics diagnostics;
    private readonly Func<CancellationToken, Task>? createRecoveryPoint;
    private readonly Func<CancellationToken, Task<IReadOnlyList<FileFactOwnedStorageRoot>>>? resolveOwnedStorage;
    private readonly SemaphoreSlim gate = new(1, 1);
    private FileFactQueuePolicy? configured;
    private FileFactQueuePolicy? desiredPolicy;
    private bool initialized;
    private bool recoveryPointCreated;
    private bool paused;
    private FileFactChangeDispatcher? changeDispatcher;
    private string? changeSpecification;
    private readonly FileFactExecutionOwner? execution;
    public bool CanExecute => execution is not null;

    public FileFactHostSession(string databasePath, Func<CancellationToken, Task>? createRecoveryPoint = null,
        Func<CancellationToken, Task<IReadOnlyList<FileFactOwnedStorageRoot>>>? resolveOwnedStorage = null,
        IFileFactContentReader? contentReader = null)
    {
        this.databasePath = databasePath;
        this.createRecoveryPoint = createRecoveryPoint;
        this.resolveOwnedStorage = resolveOwnedStorage;
        broker = new(databasePath);
        discovery = new(databasePath);
        diagnostics = new(databasePath);
        execution = contentReader is null ? null : new(contentReader);
    }

    public async Task<FileFactHostStatus> ConfigureAsync(FileFactConfigurationRequest request, CancellationToken token)
    {
        if (!request.AllowMetadataExtraction) throw Invalid("Explicit extraction confirmation is required.");
        FileFactQueue.ValidatePolicy(request.Policy);
        var policy = request.Policy with { VolumeOrder = request.Policy.VolumeOrder.ToArray(),
            Includes = request.Policy.Includes.ToArray(), Excludes = request.Policy.Excludes.ToArray() };
        await gate.WaitAsync(token);
        try
        {
            var effective = await ResolveEffectivePolicyAsync(policy, token);
            if (!initialized)
            {
                if (!recoveryPointCreated)
                {
                    if (createRecoveryPoint is not null) await createRecoveryPoint(token);
                    recoveryPointCreated = true;
                }
                token.ThrowIfCancellationRequested();
                await broker.InitializeAsync(token);
                initialized = true;
            }
            execution?.Revoke();
            if (execution is not null) await execution.ReleaseAsync();
            await broker.SetPolicyAsync(effective, token);
            configured = effective; desiredPolicy = policy;
            changeDispatcher = null; changeSpecification = null;
            paused = false;
            return new("active");
        }
        finally { gate.Release(); }
    }

    public async Task<FileFactHostStatus> PauseAsync(CancellationToken token)
    {
        await gate.WaitAsync(token);
        try
        {
            if (!initialized || configured is null) return new("inactive");
            execution?.Revoke();
            if (execution is not null) await execution.ReleaseAsync();
            await broker.SetPolicyAsync(configured with { Includes = [] }, token);
            paused = true;
            return new("paused");
        }
        finally { gate.Release(); }
    }

    public async Task<FileFactDiscoveryPage> DiscoverAsync(FileFactDiscoveryRequest request, CancellationToken token)
    {
        await gate.WaitAsync(token);
        try
        {
            RequireActive();
            await RefreshOwnedPolicyAsync(token);
            var page = await discovery.ReadPageAsync(FileFactSelection.ForVolume(configured!, request.VolumeId), request.Kind, request.ExtractorVersion,
                request.Extensions, request.After, request.PageSize, token);
            await broker.EnqueueAsync(page.Jobs, token);
            return page;
        }
        finally { gate.Release(); }
    }

    public async Task<FileFactClaimResult> ClaimAsync(CancellationToken token, FileFactClaimSpecification? specification = null)
    {
        await gate.WaitAsync(token);
        try { RequireActive(); await RefreshOwnedPolicyAsync(token); if (specification?.VolumeId is not null) _ = FileFactSelection.ForVolume(configured!, specification.VolumeId);
            var result = await broker.ClaimAsync(token, specification);
            if (result.State == FileFactClaimState.Empty && execution is not null) await execution.ReleaseAsync();
            return result; }
        finally { gate.Release(); }
    }

    public async Task<FileFactExecutionResult> ExecuteAsync(FileFactLeaseRequest request, CancellationToken token)
    {
        ValidateLease(request.LeaseId);
        Task<FileFactExecutionResult> work;
        await gate.WaitAsync(token);
        try {
            RequireActive();
            if (execution is null) throw new CoreProtocolException(CoreErrorCodes.NotQueryable, "Content execution is not assembled.");
            await RefreshOwnedPolicyAsync(token);
            var ticket = await broker.ReadOwnedTicketAsync(request.LeaseId, token);
            if (ticket is null) return new(FileFactBrokerCompletion.LeaseLost, null);
            work = execution.ExecuteAsync(ticket, (result, cancellation) => CompleteAsync(new(request.LeaseId, result), cancellation), token);
        }
        finally { gate.Release(); }
        try { return await work; }
        catch (FileFactWorkerException) { throw new CoreProtocolException(CoreErrorCodes.NotQueryable, "Content execution is unavailable."); }
    }

    public async ValueTask DisposeAsync() { if (execution is not null) await execution.DisposeAsync(); }

    public async Task<FileFactChangeDispatchStep> ConsumeChangesAsync(FileFactConsumeChangesRequest request, CancellationToken token)
    {
        await gate.WaitAsync(token);
        try {
            RequireActive();
            await RefreshOwnedPolicyAsync(token);
            ArgumentNullException.ThrowIfNull(request.Specifications);
            if (request.PageSize is < 1 or > 512) throw Invalid("Invalid change dispatch page size.");
            var fingerprint = JsonSerializer.Serialize(request.Specifications, CoreProtocolJson.Options);
            if (changeSpecification is not null && fingerprint != changeSpecification)
                throw Invalid("Change dispatch specifications changed before reconfiguration.");
            changeDispatcher ??= new(databasePath, configured!, request.Specifications);
            changeSpecification = fingerprint;
            return await changeDispatcher.StepAsync(request.PageSize, token);
        }
        finally { gate.Release(); }
    }

    public async Task<bool> RenewAsync(FileFactLeaseRequest request, CancellationToken token)
    {
        ValidateLease(request.LeaseId);
        await gate.WaitAsync(token);
        try {
            if (!initialized || paused || configured is null) return false;
            await RefreshOwnedPolicyAsync(token); return await broker.RenewAsync(request.LeaseId, token);
        }
        finally { gate.Release(); }
    }

    public async Task<FileFactBrokerCompletion> CompleteAsync(FileFactCompleteRequest request, CancellationToken token)
    {
        ValidateLease(request.LeaseId);
        await gate.WaitAsync(token);
        try
        {
            if (!initialized || paused || configured is null) return FileFactBrokerCompletion.LeaseLost;
            await RefreshOwnedPolicyAsync(token);
            return await broker.CompleteAsync(request.LeaseId, request.Result, token);
        }
        finally { gate.Release(); }
    }

    public async Task<FileFactHostStatus> ReadStatusAsync(FileFactQueueStatusRequest request, CancellationToken token)
    {
        if (!Enum.IsDefined(request.Kind) || request.ExtractorVersion <= 0) throw Invalid("Invalid queue specification.");
        await gate.WaitAsync(token);
        try
        {
            if (!initialized || configured is null) return new("inactive");
            return new(paused ? "paused" : "active", await diagnostics.ReadAsync(request.Kind, request.ExtractorVersion, token, request.VolumeId));
        }
        finally { gate.Release(); }
    }

    private void RequireActive()
    {
        if (!initialized || paused || configured is null) throw new CoreProtocolException(CoreErrorCodes.NotQueryable, "Extraction is not active.");
    }
    private async Task<FileFactQueuePolicy> ResolveEffectivePolicyAsync(FileFactQueuePolicy policy, CancellationToken token)
    {
        if (resolveOwnedStorage is null) return policy;
        try { return FileFactOwnedStorage.Exclude(policy, await resolveOwnedStorage(token)); }
        catch (Exception error) when (error is InvalidOperationException or ArgumentException) {
            throw new CoreProtocolException(CoreErrorCodes.NotQueryable, "Application-owned storage is not safely resolved.");
        }
    }
    private async Task RefreshOwnedPolicyAsync(CancellationToken token)
    {
        if (resolveOwnedStorage is null) return;
        var effective = await ResolveEffectivePolicyAsync(desiredPolicy!, token);
        if (JsonSerializer.Serialize(effective, CoreProtocolJson.Options) == JsonSerializer.Serialize(configured, CoreProtocolJson.Options)) return;
        await broker.SetPolicyAsync(effective, token); execution?.Revoke(); configured = effective;
        changeDispatcher = null; changeSpecification = null;
    }
    private static void ValidateLease(string lease)
    {
        if (lease is null || lease.Length != 32 || lease.Any(character => !char.IsAsciiHexDigit(character)))
            throw Invalid("Invalid extraction lease.");
    }
    private static CoreProtocolException Invalid(string message) => new(CoreErrorCodes.InvalidRequest, message);
}

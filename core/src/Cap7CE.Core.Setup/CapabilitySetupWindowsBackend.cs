using System.Security.Principal;
using static Cap7CE.Core.Setup.CapabilitySetupWindowsFileSystem;

namespace Cap7CE.Core.Setup;

internal sealed record CapabilitySetupReaderConfiguration(
    string AllowedSid,
    string ResultName,
    int WaitSeconds,
    string Phase,
    string? VolumeLetter,
    IReadOnlyList<string>? VolumeLetters);

internal sealed record CapabilitySetupOwnership(
    int SchemaVersion,
    string CapabilityVersion,
    string OwnerSid,
    string ServiceName);

public sealed class CapabilitySetupWindowsBackend :
    ICapabilitySetupTransactionBackend,
    ICapabilitySetupPlanBoundBackend
{
    private readonly CapabilitySetupWindowsPolicy policy;
    private readonly CapabilitySetupManifest setupManifest;
    private readonly CapabilityPayloadManifest payloadManifest;
    private readonly CapabilitySetupTransactionPlan expectedPlan;
    private readonly CapabilitySetupAction action;
    private readonly CapabilityCatalogDisposition catalogDisposition;
    private readonly IReadOnlyList<string> volumeLetters;
    private readonly string operationId = Guid.NewGuid().ToString("N");
    private RecoveryState? recovery;

    public CapabilitySetupWindowsBackend(
        CapabilitySetupWindowsPolicy policy,
        CapabilitySetupManifest setupManifest,
        CapabilityPayloadManifest payloadManifest,
        CapabilitySetupAction action,
        CapabilityCatalogDisposition catalogDisposition,
        IReadOnlyList<string> volumeLetters)
    {
        this.policy = policy ?? throw new ArgumentNullException(nameof(policy));
        this.setupManifest = setupManifest ?? throw new ArgumentNullException(nameof(setupManifest));
        this.payloadManifest = payloadManifest ?? throw new ArgumentNullException(nameof(payloadManifest));
        this.action = action;
        this.catalogDisposition = catalogDisposition;
        this.volumeLetters = CapabilitySetupVolumeSelection.RequireValid(volumeLetters);
        if (action == CapabilitySetupAction.Remove && this.volumeLetters.Count != 0)
        {
            throw new InvalidDataException("invalid-volume-selection");
        }
        setupManifest.Validate();
        payloadManifest.Validate(setupManifest);
        expectedPlan = CapabilitySetupTransactionPlanner.Create(action, catalogDisposition);
    }

    public void ValidatePlan(CapabilitySetupTransactionPlan plan)
    {
        ArgumentNullException.ThrowIfNull(plan);
        if (plan.Action != expectedPlan.Action || !plan.Stages.SequenceEqual(expectedPlan.Stages))
        {
            throw new InvalidDataException("transaction-backend-plan-mismatch");
        }
    }

    public async ValueTask ApplyAsync(
        CapabilitySetupTransactionStage stage,
        CancellationToken cancellationToken)
    {
        switch (stage)
        {
            case CapabilitySetupTransactionStage.CaptureRollbackState:
                CaptureRollbackState();
                break;
            case CapabilitySetupTransactionStage.StagePayload:
                await StagePayloadAsync(cancellationToken);
                break;
            case CapabilitySetupTransactionStage.VerifyPayload:
                await CapabilitySetupPayloadVerifier.VerifyAsync(
                    State.StageRoot, payloadManifest, setupManifest, cancellationToken);
                break;
            case CapabilitySetupTransactionStage.StopReaderService:
                CapabilitySetupWindowsService.Stop(policy.ReaderService, cancellationToken);
                break;
            case CapabilitySetupTransactionStage.ReplaceProgramFiles:
                ReplaceProgramFiles();
                break;
            case CapabilitySetupTransactionStage.ConfigureReaderService:
                CapabilitySetupWindowsService.Configure(policy.ReaderService);
                break;
            case CapabilitySetupTransactionStage.ApplyProgramPermissions:
                ApplyProgramPermissions();
                break;
            case CapabilitySetupTransactionStage.WriteReaderConfiguration:
                await WriteReaderConfigurationAsync(cancellationToken);
                break;
            case CapabilitySetupTransactionStage.ApplyDataPermissions:
                ApplyDataPermissions();
                break;
            case CapabilitySetupTransactionStage.VerifyInstalledState:
                await CapabilitySetupWindowsVerifier.VerifyInstalledAsync(
                    policy, payloadManifest, setupManifest, cancellationToken);
                break;
            case CapabilitySetupTransactionStage.RecordOwnership:
                await RecordOwnershipAsync(cancellationToken);
                break;
            case CapabilitySetupTransactionStage.RemoveReaderService:
                CapabilitySetupWindowsService.Remove(policy.ReaderService, cancellationToken);
                break;
            case CapabilitySetupTransactionStage.RemoveReaderConfiguration:
                MoveToBackup(policy.Layout.ReaderDataDirectory, State.DataBackup);
                break;
            case CapabilitySetupTransactionStage.RemoveProgramFiles:
                MoveToBackup(policy.Layout.CoreProgramDirectory, State.CoreBackup);
                MoveToBackup(policy.Layout.ReaderProgramDirectory, State.ReaderBackup);
                break;
            case CapabilitySetupTransactionStage.RemoveCatalog:
                MoveToBackup(policy.Layout.CatalogDirectory, State.CatalogBackup);
                break;
            case CapabilitySetupTransactionStage.VerifyRemovedState:
                VerifyRemovedState();
                break;
            case CapabilitySetupTransactionStage.ClearOwnership:
                DeleteOwnedFile(policy.OwnershipPath);
                break;
            default:
                throw new InvalidDataException("unsupported-transaction-stage");
        }
    }

    public async ValueTask RollbackAsync(
        CapabilitySetupTransactionStage stage,
        CancellationToken cancellationToken)
    {
        switch (stage)
        {
            case CapabilitySetupTransactionStage.StagePayload:
                DeleteOwnedTree(State.StageRoot);
                break;
            case CapabilitySetupTransactionStage.StopReaderService:
                CapabilitySetupWindowsService.Restore(
                    policy.ReaderService, State.Service, restoreRunning: true,
                    cancellationToken: cancellationToken);
                break;
            case CapabilitySetupTransactionStage.ConfigureReaderService:
            case CapabilitySetupTransactionStage.RemoveReaderService:
                CapabilitySetupWindowsService.Restore(
                    policy.ReaderService, State.Service, restoreRunning: false,
                    cancellationToken: cancellationToken);
                break;
            case CapabilitySetupTransactionStage.ReplaceProgramFiles:
            case CapabilitySetupTransactionStage.RemoveProgramFiles:
                RestoreDirectory(policy.Layout.CoreProgramDirectory, State.CoreBackup, State.CoreExisted);
                RestoreDirectory(policy.Layout.ReaderProgramDirectory, State.ReaderBackup, State.ReaderExisted);
                break;
            case CapabilitySetupTransactionStage.WriteReaderConfiguration:
                await RestoreFileAsync(policy.ReaderService.ConfigurationPath, State.Configuration, cancellationToken);
                break;
            case CapabilitySetupTransactionStage.ApplyDataPermissions:
                if (!State.DataExisted) DeleteOwnedTree(policy.Layout.ReaderDataDirectory);
                break;
            case CapabilitySetupTransactionStage.RemoveReaderConfiguration:
                RestoreDirectory(policy.Layout.ReaderDataDirectory, State.DataBackup, State.DataExisted);
                break;
            case CapabilitySetupTransactionStage.RemoveCatalog:
                RestoreDirectory(policy.Layout.CatalogDirectory, State.CatalogBackup, State.CatalogExisted);
                break;
            case CapabilitySetupTransactionStage.RecordOwnership:
            case CapabilitySetupTransactionStage.ClearOwnership:
                await RestoreFileAsync(policy.OwnershipPath, State.Ownership, cancellationToken);
                break;
        }
    }

    public ValueTask FinalizeAsync(CancellationToken cancellationToken)
    {
        if (recovery is null) return ValueTask.CompletedTask;
        cancellationToken.ThrowIfCancellationRequested();
        CapabilitySetupWindowsCleanup.Finalize(action, policy, [State.StageRoot, State.CoreBackup, State.ReaderBackup, State.DataBackup, State.CatalogBackup],
            [State.ConfigurationPending, State.OwnershipPending]);
        return ValueTask.CompletedTask;
    }

    private RecoveryState State => recovery ?? throw new InvalidOperationException("rollback-state-not-captured");

    private void CaptureRollbackState()
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("windows-setup-required");
        using var identity = WindowsIdentity.GetCurrent();
        if (!new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
        {
            throw new UnauthorizedAccessException("elevated-setup-required");
        }
        RequireNoReparseAncestors(policy.Layout.PayloadDirectory);
        RequireNoReparseAncestors(policy.Layout.CoreProgramDirectory);
        RequireNoReparseAncestors(policy.Layout.ReaderProgramDirectory);
        RequireNoReparseAncestors(policy.Layout.ReaderDataDirectory);
        RequireNoReparseAncestors(policy.Layout.StateDirectory);
        RequireNoReparseAncestors(policy.Layout.CatalogDirectory);

        Directory.CreateDirectory(policy.Layout.StateDirectory);
        CapabilitySetupWindowsAcl.ApplyStateDirectory(policy.Layout.StateDirectory);
        var suffix = $".cap7ce-{operationId}.bak";
        var service = CapabilitySetupWindowsService.Capture(policy.ReaderService);
        var ownership = ReadOwnedFile(policy.OwnershipPath, 4_096);
        ValidateExistingOwnership(ownership, service.Exists);
        recovery = new(
            Path.Combine(policy.Layout.StateDirectory, $"stage-{operationId}"),
            policy.Layout.CoreProgramDirectory + suffix,
            policy.Layout.ReaderProgramDirectory + suffix,
            policy.Layout.ReaderDataDirectory + suffix,
            policy.Layout.CatalogDirectory + suffix,
            Path.Combine(policy.Layout.StateDirectory, $"config-{operationId}.pending"),
            Path.Combine(policy.Layout.StateDirectory, $"ownership-{operationId}.pending"),
            Directory.Exists(policy.Layout.CoreProgramDirectory),
            Directory.Exists(policy.Layout.ReaderProgramDirectory),
            Directory.Exists(policy.Layout.ReaderDataDirectory),
            Directory.Exists(policy.Layout.CatalogDirectory),
            ReadOwnedFile(policy.ReaderService.ConfigurationPath, 4_096),
            ownership,
            service);
        foreach (var path in new[] { State.StageRoot, State.CoreBackup, State.ReaderBackup,
                     State.DataBackup, State.CatalogBackup, State.ConfigurationPending, State.OwnershipPending })
        {
            if (Directory.Exists(path) || File.Exists(path)) throw new IOException("setup-operation-path-collision");
        }
    }

    private async ValueTask StagePayloadAsync(CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(State.StageRoot);
        CapabilitySetupWindowsAcl.ApplyStateDirectory(State.StageRoot);
        foreach (var file in payloadManifest.Files)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var component = CapabilityPayloadManifest.ComponentDirectory(file.Component);
            var source = ResolveContainedPath(
                Path.Combine(policy.Layout.PayloadDirectory, component), file.RelativePath);
            RequireNoReparseAncestors(source);
            var destination = ResolveContainedPath(Path.Combine(State.StageRoot, component), file.RelativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            await CopyFileAsync(source, destination, cancellationToken);
        }
    }

    private void ReplaceProgramFiles()
    {
        MoveToBackup(policy.Layout.CoreProgramDirectory, State.CoreBackup);
        MoveToBackup(policy.Layout.ReaderProgramDirectory, State.ReaderBackup);
        CopyOwnedTree(Path.Combine(State.StageRoot, "core"), policy.Layout.CoreProgramDirectory);
        CopyOwnedTree(Path.Combine(State.StageRoot, "reader"), policy.Layout.ReaderProgramDirectory);
    }

    private void ApplyProgramPermissions()
    {
        var serviceSid = CapabilitySetupWindowsService.ResolveServiceSid(policy.ReaderService);
        CapabilitySetupWindowsAcl.ApplyProgramDirectory(policy.Layout.CoreProgramDirectory, serviceSid);
        CapabilitySetupWindowsAcl.ApplyProgramDirectory(policy.Layout.ReaderProgramDirectory, serviceSid);
    }

    private async ValueTask WriteReaderConfigurationAsync(CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(policy.Layout.ReaderDataDirectory);
        var configuration = volumeLetters.Count == 0
            ? new CapabilitySetupReaderConfiguration(
                policy.RequesterSid, "result-p33b2.json", 30, "disconnect", null, null)
            : new CapabilitySetupReaderConfiguration(
                policy.RequesterSid, "result-volume.json", 1_800, "volume", null, volumeLetters);
        await WriteOwnedFileAsync(
            policy.ReaderService.ConfigurationPath,
            State.ConfigurationPending,
            CapabilitySetupJson.Serialize(configuration),
            cancellationToken);
    }

    private void ApplyDataPermissions()
    {
        var serviceSid = CapabilitySetupWindowsService.ResolveServiceSid(policy.ReaderService);
        CapabilitySetupWindowsAcl.ApplyDataDirectory(policy.Layout.ReaderDataDirectory, serviceSid);
    }

    private async ValueTask RecordOwnershipAsync(CancellationToken cancellationToken)
    {
        var ownership = new CapabilitySetupOwnership(
            1, setupManifest.CapabilityVersion, policy.RequesterSid, policy.ReaderService.ServiceName);
        await WriteOwnedFileAsync(
            policy.OwnershipPath,
            State.OwnershipPending,
            CapabilitySetupJson.Serialize(ownership),
            cancellationToken);
    }

    private void VerifyRemovedState()
    {
        if (Directory.Exists(policy.Layout.CoreProgramDirectory)
            || Directory.Exists(policy.Layout.ReaderProgramDirectory)
            || Directory.Exists(policy.Layout.ReaderDataDirectory)
            || CapabilitySetupWindowsService.Capture(policy.ReaderService).Exists)
        {
            throw new InvalidDataException("capability-removal-verification-failed");
        }
        if (catalogDisposition == CapabilityCatalogDisposition.Remove
            && Directory.Exists(policy.Layout.CatalogDirectory))
        {
            throw new InvalidDataException("catalog-removal-verification-failed");
        }
    }

    private void ValidateExistingOwnership(byte[]? bytes, bool serviceExists)
    {
        var anyInstalledState = serviceExists
            || Directory.Exists(policy.Layout.CoreProgramDirectory)
            || Directory.Exists(policy.Layout.ReaderProgramDirectory)
            || Directory.Exists(policy.Layout.ReaderDataDirectory);
        if (bytes is null)
        {
            if (anyInstalledState) throw new InvalidDataException("installation-owner-missing");
            return;
        }
        var ownership = CapabilitySetupJson.DeserializeOwnership(bytes)
            ?? throw new InvalidDataException("ownership-empty");
        if (ownership.SchemaVersion != 1
            || ownership.ServiceName != policy.ReaderService.ServiceName)
        {
            throw new InvalidDataException("ownership-invalid");
        }
        CapabilitySetupVersionPolicy.RequireUpgradeOrRepair(
            ownership.CapabilityVersion, setupManifest.CapabilityVersion);
        if (ownership.OwnerSid != policy.RequesterSid)
        {
            throw new UnauthorizedAccessException("owned-by-another-user");
        }
    }

    private sealed record RecoveryState(
        string StageRoot,
        string CoreBackup,
        string ReaderBackup,
        string DataBackup,
        string CatalogBackup,
        string ConfigurationPending,
        string OwnershipPending,
        bool CoreExisted,
        bool ReaderExisted,
        bool DataExisted,
        bool CatalogExisted,
        byte[]? Configuration,
        byte[]? Ownership,
        CapabilitySetupServiceSnapshot Service);
}

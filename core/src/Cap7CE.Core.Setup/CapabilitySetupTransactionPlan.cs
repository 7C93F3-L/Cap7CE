namespace Cap7CE.Core.Setup;

public enum CapabilitySetupTransactionStage
{
    CaptureRollbackState,
    StagePayload,
    VerifyPayload,
    StopReaderService,
    ReplaceProgramFiles,
    ApplyProgramPermissions,
    WriteReaderConfiguration,
    ApplyDataPermissions,
    ConfigureReaderService,
    VerifyInstalledState,
    RecordOwnership,
    RemoveReaderService,
    RemoveReaderConfiguration,
    RemoveProgramFiles,
    RemoveCatalog,
    VerifyRemovedState,
    ClearOwnership
}

public sealed record CapabilitySetupTransactionPlan(
    CapabilitySetupAction Action,
    IReadOnlyList<CapabilitySetupTransactionStage> Stages);

public static class CapabilitySetupTransactionPlanner
{
    private static readonly CapabilitySetupTransactionStage[] InstallOrRepairStages =
    [
        CapabilitySetupTransactionStage.CaptureRollbackState,
        CapabilitySetupTransactionStage.StagePayload,
        CapabilitySetupTransactionStage.VerifyPayload,
        CapabilitySetupTransactionStage.StopReaderService,
        CapabilitySetupTransactionStage.ReplaceProgramFiles,
        CapabilitySetupTransactionStage.ConfigureReaderService,
        CapabilitySetupTransactionStage.ApplyProgramPermissions,
        CapabilitySetupTransactionStage.WriteReaderConfiguration,
        CapabilitySetupTransactionStage.ApplyDataPermissions,
        CapabilitySetupTransactionStage.VerifyInstalledState,
        CapabilitySetupTransactionStage.RecordOwnership
    ];

    public static CapabilitySetupTransactionPlan Create(
        CapabilitySetupAction action,
        CapabilityCatalogDisposition catalogDisposition)
    {
        if (action is CapabilitySetupAction.Enable or CapabilitySetupAction.Repair)
        {
            return new(action, [.. InstallOrRepairStages]);
        }

        if (action != CapabilitySetupAction.Remove)
        {
            throw new ArgumentOutOfRangeException(nameof(action));
        }

        var stages = new List<CapabilitySetupTransactionStage>
        {
            CapabilitySetupTransactionStage.CaptureRollbackState,
            CapabilitySetupTransactionStage.StopReaderService,
            CapabilitySetupTransactionStage.RemoveReaderService,
            CapabilitySetupTransactionStage.RemoveReaderConfiguration,
            CapabilitySetupTransactionStage.RemoveProgramFiles
        };
        if (catalogDisposition == CapabilityCatalogDisposition.Remove)
        {
            stages.Add(CapabilitySetupTransactionStage.RemoveCatalog);
        }
        stages.Add(CapabilitySetupTransactionStage.VerifyRemovedState);
        stages.Add(CapabilitySetupTransactionStage.ClearOwnership);
        return new(action, stages);
    }
}

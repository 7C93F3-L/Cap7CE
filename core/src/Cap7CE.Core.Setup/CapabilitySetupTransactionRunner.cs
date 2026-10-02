namespace Cap7CE.Core.Setup;

public interface ICapabilitySetupTransactionBackend
{
    ValueTask ApplyAsync(CapabilitySetupTransactionStage stage, CancellationToken cancellationToken);

    ValueTask RollbackAsync(CapabilitySetupTransactionStage stage, CancellationToken cancellationToken);

    ValueTask FinalizeAsync(CancellationToken cancellationToken);
}

public interface ICapabilitySetupPlanBoundBackend
{
    void ValidatePlan(CapabilitySetupTransactionPlan plan);
}

public enum CapabilitySetupTransactionStatus
{
    Succeeded,
    SucceededCleanupPending,
    RolledBack,
    RollbackIncomplete
}

public sealed record CapabilitySetupTransactionResult(
    CapabilitySetupTransactionStatus Status,
    string Reason,
    CapabilitySetupTransactionStage? FailedStage,
    IReadOnlyList<CapabilitySetupTransactionStage> AppliedStages,
    IReadOnlyList<CapabilitySetupTransactionStage> RolledBackStages,
    IReadOnlyList<CapabilitySetupTransactionStage> RollbackFailedStages,
    bool SystemChangesCommitted,
    bool CleanupRequired);

public static class CapabilitySetupTransactionRunner
{
    public static async ValueTask<CapabilitySetupTransactionResult> RunAsync(
        CapabilitySetupTransactionPlan plan,
        ICapabilitySetupTransactionBackend backend,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(plan);
        ArgumentNullException.ThrowIfNull(backend);
        Validate(plan);
        if (backend is ICapabilitySetupPlanBoundBackend boundBackend)
        {
            boundBackend.ValidatePlan(plan);
        }

        var attempted = new List<CapabilitySetupTransactionStage>();
        var applied = new List<CapabilitySetupTransactionStage>();
        CapabilitySetupTransactionStage? failedStage = null;
        var reason = "transaction-step-failed";

        try
        {
            foreach (var stage in plan.Stages)
            {
                cancellationToken.ThrowIfCancellationRequested();
                failedStage = stage;
                attempted.Add(stage);
                await backend.ApplyAsync(stage, cancellationToken);
                applied.Add(stage);
            }

            try
            {
                await backend.FinalizeAsync(CancellationToken.None);
                return new(CapabilitySetupTransactionStatus.Succeeded, "transaction-complete", null,
                    applied, [], [], true, false);
            }
            catch (Exception)
            {
                return new(CapabilitySetupTransactionStatus.SucceededCleanupPending,
                    "transaction-complete-cleanup-pending", null, applied, [], [], true, true);
            }
        }
        catch (OperationCanceledException) { reason = "transaction-cancelled"; }
        catch (CapabilitySetupTransactionFailure error) { reason = error.Reason; }
        catch (Exception)
        {
            // Never expose platform exception text through the setup contract.
        }

        var rolledBack = new List<CapabilitySetupTransactionStage>();
        var rollbackFailed = new List<CapabilitySetupTransactionStage>();
        for (var index = attempted.Count - 1; index >= 0; index--)
        {
            var stage = attempted[index];
            try
            {
                await backend.RollbackAsync(stage, CancellationToken.None);
                rolledBack.Add(stage);
            }
            catch (Exception)
            {
                rollbackFailed.Add(stage);
            }
        }

        var status = rollbackFailed.Count == 0
            ? CapabilitySetupTransactionStatus.RolledBack
            : CapabilitySetupTransactionStatus.RollbackIncomplete;
        var cleanupRequired = true;
        if (status == CapabilitySetupTransactionStatus.RolledBack)
        {
            try
            {
                await backend.FinalizeAsync(CancellationToken.None);
                cleanupRequired = false;
            }
            catch (Exception)
            {
                // The original failure remains primary; recovery material can be cleaned on retry.
            }
        }
        return new(status, reason, failedStage, applied, rolledBack, rollbackFailed, false, cleanupRequired);
    }

    private static void Validate(CapabilitySetupTransactionPlan plan)
    {
        var catalogDisposition = plan.Stages.Contains(CapabilitySetupTransactionStage.RemoveCatalog)
            ? CapabilityCatalogDisposition.Remove
            : CapabilityCatalogDisposition.Preserve;
        IReadOnlyList<CapabilitySetupTransactionStage> expectedStages;
        try
        {
            expectedStages = CapabilitySetupTransactionPlanner.Create(plan.Action, catalogDisposition).Stages;
        }
        catch (ArgumentOutOfRangeException)
        {
            throw new InvalidDataException("invalid-transaction-plan");
        }

        if (!plan.Stages.SequenceEqual(expectedStages))
        {
            throw new InvalidDataException("invalid-transaction-plan");
        }
    }
}

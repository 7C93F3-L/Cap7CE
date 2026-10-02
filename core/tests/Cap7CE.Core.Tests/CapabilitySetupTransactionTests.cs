using Cap7CE.Core.Setup;

namespace Cap7CE.Core.Tests;

internal static class CapabilitySetupTransactionTests
{
    public static async Task RunAsync()
    {
        await RunsFixedInstallTransactionAsync();
        await RollsBackFailedStageAndPriorStagesAsync();
        await ReportsIncompleteRollbackWithoutStoppingRecoveryAsync();
        await ReportsCommittedStateWhenCleanupMustRetryAsync();
        await RejectsReorderedTransactionBeforeMutationAsync();
        await RejectsMismatchedBoundBackendBeforeMutationAsync();
        TestRemoveCatalogBoundary();
    }

    private static async Task RunsFixedInstallTransactionAsync()
    {
        var plan = CapabilitySetupTransactionPlanner.Create(
            CapabilitySetupAction.Enable, CapabilityCatalogDisposition.Preserve);
        var backend = new RecordingBackend();
        var result = await CapabilitySetupTransactionRunner.RunAsync(plan, backend);

        TestAssert.Equal(CapabilitySetupTransactionStatus.Succeeded, result.Status,
            "setup transaction success status");
        TestAssert.True(result.SystemChangesCommitted, "successful setup transaction commit");
        TestAssert.True(result.AppliedStages.SequenceEqual(plan.Stages),
            "setup transaction fixed stage order");
        TestAssert.Equal(0, result.RolledBackStages.Count, "successful transaction rollback count");
        TestAssert.True(backend.Events.SequenceEqual(plan.Stages.Select(stage => $"apply:{stage}")),
            "setup backend apply order");
        TestAssert.True(backend.Finalized, "successful transaction finalization");
    }

    private static async Task RollsBackFailedStageAndPriorStagesAsync()
    {
        var plan = CapabilitySetupTransactionPlanner.Create(
            CapabilitySetupAction.Repair, CapabilityCatalogDisposition.Preserve);
        var failedStage = CapabilitySetupTransactionStage.ApplyDataPermissions;
        var backend = new RecordingBackend(failApply: failedStage);
        var result = await CapabilitySetupTransactionRunner.RunAsync(plan, backend);
        var attempted = plan.Stages.TakeWhile(stage => stage != failedStage).Append(failedStage).ToArray();

        TestAssert.Equal(CapabilitySetupTransactionStatus.RolledBack, result.Status,
            "failed setup transaction rollback status");
        TestAssert.Equal("transaction-step-failed", result.Reason, "fixed transaction failure reason");
        TestAssert.Equal(failedStage, result.FailedStage, "failed setup transaction stage");
        TestAssert.False(result.SystemChangesCommitted, "failed transaction must not commit");
        TestAssert.False(result.CleanupRequired, "complete rollback finalizes recovery material");
        TestAssert.True(result.RolledBackStages.SequenceEqual(attempted.Reverse()),
            "rollback includes possibly partial failed stage in reverse order");
    }

    private static async Task ReportsIncompleteRollbackWithoutStoppingRecoveryAsync()
    {
        var plan = CapabilitySetupTransactionPlanner.Create(
            CapabilitySetupAction.Enable, CapabilityCatalogDisposition.Preserve);
        var failedStage = CapabilitySetupTransactionStage.ConfigureReaderService;
        var rollbackFailure = CapabilitySetupTransactionStage.ReplaceProgramFiles;
        var backend = new RecordingBackend(failedStage, rollbackFailure);
        var result = await CapabilitySetupTransactionRunner.RunAsync(plan, backend);

        TestAssert.Equal(CapabilitySetupTransactionStatus.RollbackIncomplete, result.Status,
            "incomplete setup rollback status");
        TestAssert.True(result.RollbackFailedStages.SequenceEqual([rollbackFailure]),
            "rollback failure is structured");
        TestAssert.True(result.RolledBackStages.Contains(CapabilitySetupTransactionStage.CaptureRollbackState),
            "rollback continues after one compensation fails");
        TestAssert.False(result.SystemChangesCommitted, "incomplete rollback must not claim commit");
        TestAssert.True(result.CleanupRequired, "incomplete rollback preserves recovery material");
    }

    private static async Task ReportsCommittedStateWhenCleanupMustRetryAsync()
    {
        var plan = CapabilitySetupTransactionPlanner.Create(
            CapabilitySetupAction.Enable, CapabilityCatalogDisposition.Preserve);
        var result = await CapabilitySetupTransactionRunner.RunAsync(
            plan, new RecordingBackend(failFinalize: true));

        TestAssert.Equal(CapabilitySetupTransactionStatus.SucceededCleanupPending, result.Status,
            "post-commit cleanup failure status");
        TestAssert.True(result.SystemChangesCommitted, "cleanup failure preserves committed result");
        TestAssert.True(result.CleanupRequired, "cleanup failure remains explicit");
        TestAssert.Equal("transaction-complete-cleanup-pending", result.Reason,
            "post-commit cleanup retry reason");
    }

    private static void TestRemoveCatalogBoundary()
    {
        var preserve = CapabilitySetupTransactionPlanner.Create(
            CapabilitySetupAction.Remove, CapabilityCatalogDisposition.Preserve);
        var remove = CapabilitySetupTransactionPlanner.Create(
            CapabilitySetupAction.Remove, CapabilityCatalogDisposition.Remove);

        TestAssert.False(preserve.Stages.Contains(CapabilitySetupTransactionStage.RemoveCatalog),
            "catalog remains separate by default");
        TestAssert.True(remove.Stages.Contains(CapabilitySetupTransactionStage.RemoveCatalog),
            "catalog removal requires explicit disposition");
        TestAssert.Equal(CapabilitySetupTransactionStage.ClearOwnership, remove.Stages[^1],
            "ownership clears only after removal verification");
    }

    private static async Task RejectsReorderedTransactionBeforeMutationAsync()
    {
        var backend = new RecordingBackend();
        var invalidPlan = new CapabilitySetupTransactionPlan(CapabilitySetupAction.Enable,
            [CapabilitySetupTransactionStage.CaptureRollbackState,
                CapabilitySetupTransactionStage.RecordOwnership]);
        try
        {
            await CapabilitySetupTransactionRunner.RunAsync(invalidPlan, backend);
            throw new InvalidOperationException("invalid transaction plan was accepted");
        }
        catch (InvalidDataException exception)
        {
            TestAssert.Equal("invalid-transaction-plan", exception.Message,
                "reordered transaction rejection reason");
        }
        TestAssert.Equal(0, backend.Events.Count, "invalid transaction rejected before mutation");
    }

    private static async Task RejectsMismatchedBoundBackendBeforeMutationAsync()
    {
        var backend = new BoundRecordingBackend(CapabilitySetupAction.Enable);
        var plan = CapabilitySetupTransactionPlanner.Create(
            CapabilitySetupAction.Remove, CapabilityCatalogDisposition.Preserve);
        try
        {
            await CapabilitySetupTransactionRunner.RunAsync(plan, backend);
            throw new InvalidOperationException("mismatched bound backend was accepted");
        }
        catch (InvalidDataException exception)
        {
            TestAssert.Equal("test-backend-plan-mismatch", exception.Message,
                "bound backend plan mismatch reason");
        }
        TestAssert.Equal(0, backend.ApplyCount,
            "bound backend mismatch rejected before mutation");
    }

    private sealed class RecordingBackend(
        CapabilitySetupTransactionStage? failApply = null,
        CapabilitySetupTransactionStage? failRollback = null,
        bool failFinalize = false) : ICapabilitySetupTransactionBackend
    {
        public List<string> Events { get; } = [];
        public bool Finalized { get; private set; }

        public ValueTask ApplyAsync(
            CapabilitySetupTransactionStage stage,
            CancellationToken cancellationToken)
        {
            Events.Add($"apply:{stage}");
            if (stage == failApply) throw new InvalidOperationException("private-platform-detail");
            return ValueTask.CompletedTask;
        }

        public ValueTask RollbackAsync(
            CapabilitySetupTransactionStage stage,
            CancellationToken cancellationToken)
        {
            Events.Add($"rollback:{stage}");
            if (stage == failRollback) throw new InvalidOperationException("private-rollback-detail");
            return ValueTask.CompletedTask;
        }

        public ValueTask FinalizeAsync(CancellationToken cancellationToken)
        {
            Finalized = true;
            if (failFinalize) throw new InvalidOperationException("private-cleanup-detail");
            return ValueTask.CompletedTask;
        }
    }

    private sealed class BoundRecordingBackend(CapabilitySetupAction expectedAction) :
        ICapabilitySetupTransactionBackend,
        ICapabilitySetupPlanBoundBackend
    {
        public int ApplyCount { get; private set; }

        public void ValidatePlan(CapabilitySetupTransactionPlan plan)
        {
            if (plan.Action != expectedAction) throw new InvalidDataException("test-backend-plan-mismatch");
        }

        public ValueTask ApplyAsync(CapabilitySetupTransactionStage stage, CancellationToken cancellationToken)
        {
            ApplyCount++;
            return ValueTask.CompletedTask;
        }

        public ValueTask RollbackAsync(CapabilitySetupTransactionStage stage, CancellationToken cancellationToken) =>
            ValueTask.CompletedTask;

        public ValueTask FinalizeAsync(CancellationToken cancellationToken) => ValueTask.CompletedTask;
    }
}

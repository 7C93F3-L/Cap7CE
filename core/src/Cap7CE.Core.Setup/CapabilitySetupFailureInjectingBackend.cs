namespace Cap7CE.Core.Setup;

internal sealed class CapabilitySetupFailureInjectingBackend(
    ICapabilitySetupTransactionBackend inner) :
    ICapabilitySetupTransactionBackend,
    ICapabilitySetupPlanBoundBackend
{
    public void ValidatePlan(CapabilitySetupTransactionPlan plan)
    {
        if (inner is ICapabilitySetupPlanBoundBackend boundBackend) boundBackend.ValidatePlan(plan);
    }

    public async ValueTask ApplyAsync(
        CapabilitySetupTransactionStage stage,
        CancellationToken cancellationToken)
    {
        await inner.ApplyAsync(stage, cancellationToken);
        if (stage == CapabilitySetupTransactionStage.ApplyDataPermissions)
        {
            throw new InvalidOperationException("fixed-development-failure-probe");
        }
    }

    public ValueTask RollbackAsync(
        CapabilitySetupTransactionStage stage,
        CancellationToken cancellationToken) => inner.RollbackAsync(stage, cancellationToken);

    public ValueTask FinalizeAsync(CancellationToken cancellationToken) =>
        inner.FinalizeAsync(cancellationToken);
}

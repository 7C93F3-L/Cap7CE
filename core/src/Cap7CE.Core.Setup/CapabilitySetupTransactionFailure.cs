namespace Cap7CE.Core.Setup;

public sealed class CapabilitySetupTransactionFailure(
    string reason,
    Exception innerException) : Exception(reason, innerException)
{
    public string Reason { get; } = reason;
}

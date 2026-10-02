namespace Cap7CE.Core.Setup;

public sealed record CapabilitySetupActivationRequest(
    int SchemaVersion,
    CapabilitySetupAction Action,
    CapabilityCatalogDisposition CatalogDisposition,
    IReadOnlyList<string> VolumeLetters);

public sealed record CapabilitySetupActivationResponse(
    string Status,
    string Reason,
    CapabilitySetupTransactionStatus? TransactionStatus,
    CapabilitySetupTransactionStage? FailedStage,
    bool SystemChangesCommitted,
    bool CleanupRequired);

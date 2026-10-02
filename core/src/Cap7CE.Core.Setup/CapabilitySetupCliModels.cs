namespace Cap7CE.Core.Setup;

internal sealed record CapabilitySetupCliStatus(
    string Status,
    string Reason,
    bool SystemChangesPerformed);

internal sealed record CapabilityPayloadCliStatus(
    string Status,
    string Reason,
    int Files,
    long Bytes,
    bool SystemChangesPerformed);

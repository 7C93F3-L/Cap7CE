namespace Cap7CE.Core.Setup;

public sealed record CapabilitySetupAuthenticatedRequest(
    CapabilitySetupActivationRequest Request,
    CapabilityRequesterIdentity Requester);

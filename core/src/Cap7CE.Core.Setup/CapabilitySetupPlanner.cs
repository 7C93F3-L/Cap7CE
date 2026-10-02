namespace Cap7CE.Core.Setup;

public enum CapabilitySetupAction
{
    Enable,
    Repair,
    Remove
}

public enum CapabilityRuntimeState
{
    Missing,
    Ready,
    Damaged,
    RestartRequired
}

public enum CapabilityInstallationState
{
    NotInstalled,
    Installed,
    RepairNeeded
}

public enum CapabilityOwnershipState
{
    Unowned,
    RequestingUser,
    AnotherUser
}

public enum CapabilityCatalogDisposition
{
    Preserve,
    Remove
}

public enum CapabilitySetupNextStep
{
    None,
    LaunchRuntimeInstallerForeground,
    LaunchCapabilitySetupElevated,
    AwaitRestart,
    Blocked
}

public sealed record CapabilitySetupPlanRequest(
    CapabilitySetupAction Action,
    CapabilityRuntimeState RuntimeState,
    CapabilityInstallationState InstallationState,
    CapabilityOwnershipState OwnershipState,
    CapabilityCatalogDisposition CatalogDisposition,
    bool SupportedSystem = true);

public sealed record CapabilitySetupPlan(
    string Status,
    string Reason,
    CapabilitySetupNextStep NextStep,
    bool RequiresUserContinuation,
    bool RequiresCap7CEElevation,
    bool PreserveMicrosoftRuntime,
    bool RemoveCatalog,
    bool SystemChangesPerformed,
    string? ExternalInstallerUrl,
    string[] ExternalInstallerArguments);

public static class CapabilitySetupPlanner
{
    public static CapabilitySetupPlan Plan(
        CapabilitySetupPlanRequest request,
        CapabilitySetupManifest manifest)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(manifest);
        manifest.Validate();

        if (!request.SupportedSystem) return Blocked("unsupported-system");
        if (request.OwnershipState == CapabilityOwnershipState.AnotherUser)
        {
            return Blocked("owned-by-another-user");
        }

        if (request.InstallationState != CapabilityInstallationState.NotInstalled
            && request.OwnershipState == CapabilityOwnershipState.Unowned)
        {
            return Blocked("installation-owner-missing");
        }

        if (request.InstallationState == CapabilityInstallationState.NotInstalled
            && request.OwnershipState == CapabilityOwnershipState.RequestingUser)
        {
            return Blocked("installation-state-inconsistent");
        }

        if (request.Action == CapabilitySetupAction.Remove
            && request.InstallationState == CapabilityInstallationState.NotInstalled)
        {
            return Complete("already-removed", request.CatalogDisposition == CapabilityCatalogDisposition.Remove);
        }

        if (request.RuntimeState == CapabilityRuntimeState.RestartRequired)
        {
            return new("waiting", "runtime-restart-required", CapabilitySetupNextStep.AwaitRestart,
                true, false, true, false, false, null, []);
        }

        if (request.RuntimeState == CapabilityRuntimeState.Missing)
        {
            if (request.Action == CapabilitySetupAction.Remove)
            {
                return Elevated("capability-remove-required-native", request.CatalogDisposition == CapabilityCatalogDisposition.Remove);
            }
            return RuntimeInstaller("runtime-missing", manifest.Runtime.InstallerUrl,
                manifest.Runtime.InstallArguments);
        }

        if (request.RuntimeState == CapabilityRuntimeState.Damaged)
        {
            if (request.Action == CapabilitySetupAction.Remove)
            {
                return Elevated("capability-remove-required-native", request.CatalogDisposition == CapabilityCatalogDisposition.Remove);
            }
            return RuntimeInstaller("runtime-repair-required", manifest.Runtime.InstallerUrl,
                manifest.Runtime.RepairArguments);
        }

        return request.Action switch
        {
            CapabilitySetupAction.Enable when request.InstallationState == CapabilityInstallationState.Installed
                => Complete("already-installed", false),
            CapabilitySetupAction.Enable when request.InstallationState == CapabilityInstallationState.RepairNeeded
                => Elevated("capability-repair-required", false),
            CapabilitySetupAction.Enable
                => Elevated("capability-install-required", false),
            CapabilitySetupAction.Repair when request.InstallationState == CapabilityInstallationState.NotInstalled
                => Elevated("capability-install-required", false),
            CapabilitySetupAction.Repair
                => Elevated("capability-repair-required", false),
            CapabilitySetupAction.Remove
                => Elevated("capability-remove-required",
                    request.CatalogDisposition == CapabilityCatalogDisposition.Remove),
            _ => Blocked("invalid-request")
        };
    }

    private static CapabilitySetupPlan RuntimeInstaller(string reason, string url, string[] arguments) =>
        new("planned", reason, CapabilitySetupNextStep.LaunchRuntimeInstallerForeground,
            true, false, true, false, false, url, [.. arguments]);

    private static CapabilitySetupPlan Elevated(string reason, bool removeCatalog) =>
        new("planned", reason, CapabilitySetupNextStep.LaunchCapabilitySetupElevated,
            true, true, true, removeCatalog, false, null, []);

    private static CapabilitySetupPlan Complete(string reason, bool removeCatalog) =>
        new("complete", reason, CapabilitySetupNextStep.None,
            false, false, true, removeCatalog, false, null, []);

    private static CapabilitySetupPlan Blocked(string reason) =>
        new("blocked", reason, CapabilitySetupNextStep.Blocked,
            false, false, true, false, false, null, []);
}

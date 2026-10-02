namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupCoordinatorArguments
{
    private const string CoordinatorMode = "--activation-coordinator";

    public static bool IsRequest(string[] args) =>
        args is [CoordinatorMode, "--action", _, "--catalog", _]
            or [CoordinatorMode, "--action", _, "--catalog", _, "--volumes", _];

    public static bool TryParseRequest(
        string[] args,
        out CapabilitySetupAction action,
        out CapabilityCatalogDisposition catalogDisposition,
        out IReadOnlyList<string> volumeLetters)
    {
        action = default;
        catalogDisposition = default;
        volumeLetters = Array.Empty<string>();
        string actionSource;
        string catalogSource;
        switch (args)
        {
            case [CoordinatorMode, "--action", var actionValue, "--catalog", var catalogValue]:
                actionSource = actionValue;
                catalogSource = catalogValue;
                break;
            case [CoordinatorMode, "--action", var actionValue, "--catalog", var catalogValue,
                    "--volumes", var volumesSource]
                when CapabilitySetupVolumeSelection.TryParseArgument(volumesSource, out volumeLetters):
                actionSource = actionValue;
                catalogSource = catalogValue;
                break;
            default:
                return false;
        }

        return CapabilitySetupArgumentValues.TryParseAction(actionSource, out action)
            && CapabilitySetupArgumentValues.TryParseCatalog(catalogSource, out catalogDisposition)
            && (action != CapabilitySetupAction.Remove || volumeLetters.Count == 0);
    }
}

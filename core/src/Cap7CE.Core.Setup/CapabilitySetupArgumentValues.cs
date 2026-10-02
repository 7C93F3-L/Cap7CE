namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupArgumentValues
{
    public static bool TryParseAction(string source, out CapabilitySetupAction action)
    {
        action = source switch
        {
            "enable" => CapabilitySetupAction.Enable,
            "repair" => CapabilitySetupAction.Repair,
            "remove" => CapabilitySetupAction.Remove,
            _ => default
        };
        return source is "enable" or "repair" or "remove";
    }

    public static bool TryParseCatalog(
        string source,
        out CapabilityCatalogDisposition disposition)
    {
        disposition = source switch
        {
            "preserve" => CapabilityCatalogDisposition.Preserve,
            "remove" => CapabilityCatalogDisposition.Remove,
            _ => default
        };
        return source is "preserve" or "remove";
    }

    public static string ActionArgument(CapabilitySetupAction action) => action switch
    {
        CapabilitySetupAction.Enable => "enable",
        CapabilitySetupAction.Repair => "repair",
        CapabilitySetupAction.Remove => "remove",
        _ => throw new ArgumentOutOfRangeException(nameof(action))
    };

    public static string CatalogArgument(CapabilityCatalogDisposition disposition) => disposition switch
    {
        CapabilityCatalogDisposition.Preserve => "preserve",
        CapabilityCatalogDisposition.Remove => "remove",
        _ => throw new ArgumentOutOfRangeException(nameof(disposition))
    };
}

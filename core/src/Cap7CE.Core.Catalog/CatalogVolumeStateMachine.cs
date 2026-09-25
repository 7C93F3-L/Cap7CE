namespace Cap7CE.Core.Catalog;

public static class CatalogVolumeStateMachine
{
    private static readonly IReadOnlyDictionary<CatalogVolumeState, IReadOnlySet<CatalogVolumeState>> Allowed =
        new Dictionary<CatalogVolumeState, IReadOnlySet<CatalogVolumeState>>
        {
            [CatalogVolumeState.Disabled] = Set(CatalogVolumeState.Discovering),
            [CatalogVolumeState.Discovering] = Set(CatalogVolumeState.Building),
            [CatalogVolumeState.Building] = Set(CatalogVolumeState.Ready),
            [CatalogVolumeState.Ready] = Set(
                CatalogVolumeState.CatchingUp,
                CatalogVolumeState.Offline,
                CatalogVolumeState.Degraded,
                CatalogVolumeState.NeedsRebuild),
            [CatalogVolumeState.CatchingUp] = Set(
                CatalogVolumeState.Ready,
                CatalogVolumeState.Offline,
                CatalogVolumeState.Degraded,
                CatalogVolumeState.NeedsRebuild),
            [CatalogVolumeState.Offline] = Set(
                CatalogVolumeState.CatchingUp,
                CatalogVolumeState.NeedsRebuild),
            [CatalogVolumeState.Degraded] = Set(
                CatalogVolumeState.CatchingUp,
                CatalogVolumeState.NeedsRebuild),
            [CatalogVolumeState.NeedsRebuild] = Set(CatalogVolumeState.Building)
        };

    public static bool CanTransition(CatalogVolumeState from, CatalogVolumeState to) =>
        from == to || Allowed[from].Contains(to);

    public static string ToStorage(CatalogVolumeState state) => state switch
    {
        CatalogVolumeState.Disabled => "disabled",
        CatalogVolumeState.Discovering => "discovering",
        CatalogVolumeState.Building => "building",
        CatalogVolumeState.Ready => "ready",
        CatalogVolumeState.CatchingUp => "catchingUp",
        CatalogVolumeState.Offline => "offline",
        CatalogVolumeState.Degraded => "degraded",
        CatalogVolumeState.NeedsRebuild => "needsRebuild",
        _ => throw new ArgumentOutOfRangeException(nameof(state))
    };

    public static CatalogVolumeState FromStorage(string value) => value switch
    {
        "disabled" => CatalogVolumeState.Disabled,
        "discovering" => CatalogVolumeState.Discovering,
        "building" => CatalogVolumeState.Building,
        "ready" => CatalogVolumeState.Ready,
        "catchingUp" => CatalogVolumeState.CatchingUp,
        "offline" => CatalogVolumeState.Offline,
        "degraded" => CatalogVolumeState.Degraded,
        "needsRebuild" => CatalogVolumeState.NeedsRebuild,
        _ => throw new CatalogSchemaException("Catalog contains an unknown volume state.")
    };

    private static IReadOnlySet<CatalogVolumeState> Set(params CatalogVolumeState[] states) =>
        states.ToHashSet();
}

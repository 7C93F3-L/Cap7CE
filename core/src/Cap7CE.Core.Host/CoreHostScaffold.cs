using Cap7CE.Core.Adapters;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host;

/// <summary>Describes the isolated Core state without activating a transport.</summary>
public static class CoreHostScaffold
{
    public static CoreHostScaffoldStatus Describe() => new(
        State: "catalog-cli-fixture-ready",
        ProtocolImplemented: true,
        CatalogImplemented: true,
        RealAdapterConnected: false,
        SyntheticFixtureAvailable: true,
        Layers:
        [
            ProtocolAssembly.Role,
            CatalogAssembly.Role,
            AdapterAbstractionsAssembly.Role
        ]);
}

public sealed record CoreHostScaffoldStatus(
    string State,
    bool ProtocolImplemented,
    bool CatalogImplemented,
    bool RealAdapterConnected,
    bool SyntheticFixtureAvailable,
    IReadOnlyList<string> Layers);

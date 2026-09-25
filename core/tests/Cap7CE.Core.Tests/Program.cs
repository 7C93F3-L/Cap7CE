using System.Reflection;
using System.Text.Json;
using Cap7CE.Core.Adapters;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;
using Cap7CE.Core.Reader.Protocol;
using Cap7CE.Core.Reader.Host;
using Cap7CE.Core.Tests;

if (args is ["--catalog-crash-worker"])
{
    return await CatalogCrashWorker.RunAsync();
}

var expectedLayers = new Dictionary<Assembly, string>
{
    [typeof(ProtocolAssembly).Assembly] = ProtocolAssembly.Role,
    [typeof(ReaderProtocolAssembly).Assembly] = ReaderProtocolAssembly.Role,
    [typeof(ReaderHostAssembly).Assembly] = ReaderHostAssembly.Role,
    [typeof(CatalogAssembly).Assembly] = CatalogAssembly.Role,
    [typeof(AdapterAbstractionsAssembly).Assembly] = AdapterAbstractionsAssembly.Role,
    [typeof(CoreHostScaffold).Assembly] = "Host"
};
foreach (var (assembly, expectedLayer) in expectedLayers)
{
    var actualLayer = assembly.GetCustomAttributes<AssemblyMetadataAttribute>()
        .SingleOrDefault(attribute => attribute.Key == "Cap7CE.Core.Layer")?.Value;
    TestAssert.Equal(expectedLayer, actualLayer, "assembly layer metadata");
}

var status = CoreHostScaffold.Describe();
TestAssert.Equal("catalog-cli-fixture-ready", status.State, "host state");
TestAssert.True(status.ProtocolImplemented, "protocol must be implemented");
TestAssert.True(status.CatalogImplemented, "catalog must be implemented");
TestAssert.False(status.RealAdapterConnected, "real adapter must remain disconnected");
TestAssert.True(status.SyntheticFixtureAvailable, "synthetic fixture must be available");

await ProtocolFrameTests.RunAsync();
await ReaderProtocolTests.RunAsync();
ReaderNtfsParserTests.Run();
await SearchCursorCodecTests.RunAsync();
await HostProtocolTests.RunAsync();
await CatalogDatabaseTests.RunAsync();
await CatalogRecoveryTests.RunAsync();
var readOnlyBaseline = await CatalogReadOnlyCliTests.RunAsync();
var catalogV2 = await CatalogV2Tests.RunAsync();

Console.WriteLine(JsonSerializer.Serialize(new
{
    status = "passed",
    assemblies = expectedLayers.Count,
    protocolVersion = CoreProtocol.CurrentVersion,
    readerProtocolVersion = ReaderProtocol.CurrentMajorVersion,
    readerOperations = Enum.GetValues<ReaderOperation>().Length,
    crossProcessSyntheticItemsPaged = 100_000,
    inProcessSyntheticItemsPaged = 1_000_000,
    nativeCatalogSchemaVersion = 1,
    productionCatalogSchemaVersion = CatalogV2Contract.SchemaVersion,
    productionCatalogPathStrategy = catalogV2.SelectedStrategy,
    productionCatalogPathMeasurements = catalogV2.Measurements,
    productionCatalogMultiVolume = true,
    productionCatalogScopes = new[] { "all-volumes", "volume", "directory-descendants", "direct-children", "saved-scope" },
    productionCatalogFacts = new[] { "name", "path", "extension", "type", "size", "created", "modified", "attributes" },
    productionCoreSc1 = true,
    catalogFixtures = "temporary-only",
    catalogCrashRecovery = true,
    catalogContinuityRecovery = true,
    catalogReadOnlyCli = true,
    catalogSyntheticBaselineRows = readOnlyBaseline.Rows,
    catalogSyntheticOpenAndValidateMs = readOnlyBaseline.OpenAndValidateMs,
    catalogSyntheticFirstPageMs = readOnlyBaseline.FirstPageMs,
    catalogSyntheticNameHitP95Ms = readOnlyBaseline.NameHit.P95Ms,
    catalogSyntheticNameMissP95Ms = readOnlyBaseline.NameMiss.P95Ms,
    catalogSyntheticExtensionHitP95Ms = readOnlyBaseline.ExtensionHit.P95Ms,
    catalogSyntheticFullScanMs = readOnlyBaseline.FullScanMs,
    catalogSyntheticFullScanRowsPerSecond = readOnlyBaseline.FullScanRowsPerSecond,
    catalogSyntheticDatabaseBytes = readOnlyBaseline.DatabaseBytes,
    catalogSyntheticDatabaseBytesPerRow = readOnlyBaseline.DatabaseBytesPerRow,
    catalogSyntheticPeakRssBytes = readOnlyBaseline.PeakRssBytes,
    realFileSystemAccessDuringAutomatedTests = false,
    realNtfsAdapterBuilt = true,
    readerServiceExecutableBuilt = true,
    readerServiceInstalled = false,
    serviceInstalled = false,
    electronConnected = false
}));
return 0;

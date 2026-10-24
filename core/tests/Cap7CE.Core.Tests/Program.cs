using System.Reflection;
using System.Text.Json;
using Cap7CE.Core.Adapters;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;
using Cap7CE.Core.Reader.Protocol;
using Cap7CE.Core.Reader.Host;
using Cap7CE.Core.Setup;
using Cap7CE.Core.Tests;

if (args is ["--catalog-natural-order-tests"]) { await CatalogNaturalOrderingTests.RunAsync(); return 0; }
if (args is ["--catalog-result-count-tests"]) { await CatalogResultCountTests.RunAsync(); return 0; }
if (args is ["--catalog-preparation-tests"]) { await CatalogPreparationProgressTests.RunAsync(); return 0; }
if (args is ["--metadata-state-tests"]) { await MetadataBuildStateFileTests.RunAsync(); return 0; }
if (args is ["--metadata-sweep-tests"]) { await MetadataExtractorManifestTests.RunAsync(); await MetadataBuildSweepTests.RunAsync(); return 0; }
if (args is ["--metadata-lifecycle-tests"]) { await MetadataBuildGrantLifecycleTests.RunAsync(); await FileFactBuildOwnershipTests.RunAsync(); return 0; }
if (args is ["--metadata-global-tests"]) { await MetadataGlobalBuildTests.RunAsync(); return 0; }
if (args is ["--metadata-directory-tests"]) { await MetadataDirectoryCoordinatorTests.RunAsync(); return 0; }
if (args is ["--metadata-coordinator-native-tests"]) { await MetadataCoordinatorNativeTests.RunAsync(); return 0; }
if (args is ["--metadata-hosting-tests"]) { await MetadataBuildHostingTests.RunAsync(); return 0; }
if (args is ["--metadata-worker-tests"]) {
    await FileFactExecutionTests.RunAsync();
    await NodeMetadataWorkerTests.RunAsync();
    return 0;
}
if (args is ["--metadata-job-owner", var metadataRuntime, var metadataSource])
    return await NodeMetadataWorkerTests.RunOwnerAsync(metadataRuntime, metadataSource);
if (args is ["--trash-policy-tests"]) { await TrashBatchExecutorTests.RunAsync(); return 0; }
if (args is ["--reader-startup-deadline-tests"]) { await ReaderJournalStartupDeadlineTests.RunAsync(); return 0; }

if (args is ["--catalog-crash-worker"])
{
    return await CatalogCrashWorker.RunAsync();
}

if (args is ["--setup-identity-client", var pipeName, var expectedServer]
    && uint.TryParse(expectedServer, out var expectedServerProcessId))
{
    return await CapabilitySetupIdentityTests.RunClientAsync(pipeName, expectedServerProcessId);
}

var expectedLayers = new Dictionary<Assembly, string>
{
    [typeof(Cap7CE.Core.Configuration.FavoriteDirectory).Assembly] = "Configuration",
    [typeof(Cap7CE.Core.FileOperations.WindowsFileOperation).Assembly] = "FileOperations",
    [typeof(ProtocolAssembly).Assembly] = ProtocolAssembly.Role,
    [typeof(ReaderProtocolAssembly).Assembly] = ReaderProtocolAssembly.Role,
    [typeof(ReaderHostAssembly).Assembly] = ReaderHostAssembly.Role,
    [typeof(CatalogAssembly).Assembly] = CatalogAssembly.Role,
    [typeof(AdapterAbstractionsAssembly).Assembly] = AdapterAbstractionsAssembly.Role,
    [typeof(CoreHostScaffold).Assembly] = "Host",
    [typeof(CapabilitySetupPlanner).Assembly] = "Setup"
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
var nativeDependencyProbe = await CatalogNativeDependencyProbe.RunAsync();
TestAssert.Equal("passed", nativeDependencyProbe.Status, "native catalog dependency probe");
TestAssert.False(nativeDependencyProbe.SourceFilesRead, "native catalog dependency probe source boundary");

await ProtocolFrameTests.RunAsync();
await FavoriteConfigurationTests.RunAsync();
await MetadataBuildStateFileTests.RunAsync();
await MetadataBuildGrantLifecycleTests.RunAsync();
await FileFactBuildOwnershipTests.RunAsync();
await MetadataGlobalBuildTests.RunAsync();
await MetadataDirectoryCoordinatorTests.RunAsync();
await MetadataCoordinatorNativeTests.RunAsync();
await MetadataBuildHostingTests.RunAsync();
await MetadataExtractorManifestTests.RunAsync();
await MetadataBuildSweepTests.RunAsync();
await CoreRequestIdentityTests.RunAsync();
await ReaderProtocolTests.RunAsync();
ReaderConnectionLifetimeTests.Run();
await ReaderSessionCapabilityTests.RunAsync();
ReaderNtfsParserTests.Run();
await SearchCursorCodecTests.RunAsync();
await HostProtocolTests.RunAsync();
await CoreRequestSchedulingTests.RunAsync();
await CatalogDatabaseTests.RunAsync();
await CatalogRecoveryTests.RunAsync();
await CatalogPreparationProgressTests.RunAsync();
var readOnlyBaseline = await CatalogReadOnlyCliTests.RunAsync();
var catalogV2 = await CatalogV2Tests.RunAsync();
await CatalogVolumeRootTests.RunAsync();
await CatalogOrderingTests.RunAsync();
await CatalogNaturalOrderingTests.RunAsync();
await CatalogResultCountTests.RunAsync();
await CatalogFileEntryTests.RunAsync();
await CatalogFileEntryQueryTests.RunAsync();
await NativeFileEntryTests.RunAsync();
await NativeFileEntryCatalogTests.RunAsync();
await ReaderHardLinkMetadataTests.RunAsync();
ReaderSnapshotEntryCacheTests.Run();
ReaderEntryPresenceTests.Run();
await ReaderFileEntryProtocolTests.RunAsync();
await ReaderFileEntryClientTests.RunAsync();
await CatalogEntrySynchronizationTests.RunAsync();
await CatalogEntrySnapshotFenceTests.RunAsync();
await CatalogSnapshotEntryParentTests.RunAsync();
await CatalogJournalEntryParentTests.RunAsync();
await CatalogCrossVolumeResumeTests.RunAsync();
await CatalogTextCandidateTests.RunAsync();
await CatalogEntryRetryTests.RunAsync();
await CatalogEntryActivationTests.RunAsync();
await CatalogEntryMaintenanceTests.RunAsync();
await CatalogEntryRuntimeTests.RunAsync();
await CatalogEntryScaleTests.RunAsync();
await FileFactEntryPolicyTests.RunAsync();
await CatalogRandomOrderingTests.RunAsync();
await FileFactDatabaseTests.RunAsync();
await FileFactImageDetailsTests.RunAsync();
await FileFactAudioDetailsTests.RunAsync();
await FileFactFontDetailsTests.RunAsync();
await FileFactModelDetailsTests.RunAsync();
await FileFactDocumentDetailsTests.RunAsync();
await FileFactThreeDDetailsTests.RunAsync();
await FileFactTextDataDetailsTests.RunAsync();
await FileFactArchiveDetailsTests.RunAsync();
await FileFactRecoveryCheckpointTests.RunAsync();
await FileFactQueueTests.RunAsync();
await FileFactDiscoveryTests.RunAsync();
await NativeFileFactSourceGuardTests.RunAsync();
await FileFactExtractionBrokerTests.RunAsync();
await FileFactExecutionTests.RunAsync();
await NodeMetadataWorkerTests.RunAsync();
await TrashBatchExecutorTests.RunAsync();
await FileFactCatalogIntegrationTests.RunAsync();
await FileFactChangeLogTests.RunAsync();
await FileFactChangeDispatcherTests.RunAsync();
await FileFactOwnedStorageTests.RunAsync();
await CatalogJournalAdvanceTests.RunAsync();
await ReaderJournalWaitTests.RunAsync();
await CatalogOwnedDirectoryTests.RunAsync();
await CatalogOwnedDirectoryStageTests.RunAsync();
await CatalogJournalPageOwnerTests.RunAsync();
await CatalogReaderOwnershipTests.RunAsync();
await CatalogJournalMonitorTests.RunAsync();
await CatalogPreparationDiagnosticsTests.RunAsync();
await CatalogChangeSignalTests.RunAsync();
await FileFactOwnedPolicyTests.RunAsync();
await FileFactQueryTests.RunAsync();
await UnclassifiedSearchTests.RunAsync();
await CatalogKeywordTests.RunAsync();
await CatalogQueryCancellationTests.RunAsync();
await CatalogWalConcurrencyTests.RunAsync();
await CatalogDirectoryPathChangesTests.RunAsync();
await FileFactScopeScaleTests.RunAsync();
await CapabilitySetupContractTests.RunAsync();
await CapabilitySetupPayloadTests.RunAsync();
await CapabilitySetupIdentityTests.RunAsync();
await CapabilitySetupTransactionTests.RunAsync();
CapabilitySetupVersionTests.Run();

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
    catalogReaderInterruptionRecovery = true,
    catalogClosedPeriodIncrementalRecovery = true,
    catalogReadOnlyCli = true,
    catalogNativeDependencyProbe = nativeDependencyProbe.Status,
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
    sourceFilesReadDuringAutomatedTests = OperatingSystem.IsWindows(),
    sourceContentReadScope = "owned-generated-test-fixtures-only",
    userSourceFilesRead = false,
    temporaryCapabilityPayloadVerified = true,
    realNtfsAdapterBuilt = true,
    readerServiceExecutableBuilt = true,
    readerServiceInstalled = false,
    serviceInstalled = false,
    capabilitySetup = "native-aot-transaction-core",
    systemMutationDuringSetupTests = false,
    electronConnected = false
}));
return 0;

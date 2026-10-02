const findSource = (entries, name) =>
  entries.find((entry) => entry.name === name)?.source ?? "";

const joinSources = (entries, excludedNames = []) => {
  const excluded = new Set(excludedNames);
  return entries.filter((entry) => !excluded.has(entry.name))
    .map((entry) => entry.source).join("\n");
};

const createCapabilitySetupSourceGroups = (entries) => ({
  setupSources: joinSources(entries),
  payloadVerifier: findSource(entries, "CapabilitySetupPayloadVerifier.cs"),
  peerIdentity: findSource(entries, "CapabilitySetupPeerIdentity.cs"),
  activationPipe: findSource(entries, "CapabilitySetupActivationPipe.cs"),
  activationProtocol: findSource(entries, "CapabilitySetupActivationProtocol.cs"),
  activationFrameCodec: findSource(entries, "CapabilitySetupActivationFrameCodec.cs"),
  volumeSelection: findSource(entries, "CapabilitySetupVolumeSelection.cs"),
  windowsPolicy: findSource(entries, "CapabilitySetupWindowsPolicy.cs"),
  windowsBackend: findSource(entries, "CapabilitySetupWindowsBackend.cs"),
  windowsAcl: findSource(entries, "CapabilitySetupWindowsAcl.cs"),
  windowsService: findSource(entries, "CapabilitySetupWindowsService.cs"),
  serviceHardening: findSource(entries, "CapabilitySetupServiceHardening.cs"),
  windowsFileSystem: findSource(entries, "CapabilitySetupWindowsFileSystem.cs"),
  windowsVerifier: findSource(entries, "CapabilitySetupWindowsVerifier.cs"),
  setupSourcesWithoutReadOnlyFiles: joinSources(entries, [
    "CapabilitySetupPayloadVerifier.cs", "CapabilitySetupPeerIdentity.cs",
    "CapabilitySetupWindowsBackend.cs", "CapabilitySetupWindowsAcl.cs",
    "CapabilitySetupWindowsFileSystem.cs", "CapabilitySetupWindowsCleanup.cs",
    "CapabilitySetupWindowsVerifier.cs"
  ]),
  setupSourcesWithoutPeerIdentity: joinSources(entries, [
    "CapabilitySetupPeerIdentity.cs", "CapabilitySetupWindowsBackend.cs",
    "CapabilitySetupWindowsAcl.cs", "CapabilitySetupWindowsService.cs",
    "CapabilitySetupServiceHardening.cs", "CapabilitySetupServiceCommand.cs",
    "CapabilitySetupElevatedServerLauncher.cs"
  ]),
  setupSourcesWithoutServicePlatform: joinSources(entries, [
    "CapabilitySetupWindowsService.cs", "CapabilitySetupServiceHardening.cs"
  ]),
  setupSourcesWithoutMutationBackend: joinSources(entries, [
    "CapabilitySetupWindowsBackend.cs", "CapabilitySetupWindowsAcl.cs",
    "CapabilitySetupWindowsFileSystem.cs", "CapabilitySetupWindowsCleanup.cs"
  ])
});

module.exports = { createCapabilitySetupSourceGroups };

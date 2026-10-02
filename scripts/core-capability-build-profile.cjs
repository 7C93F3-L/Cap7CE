const selectCapabilityBuildProfile = (args) => {
  const product = args.includes("--product");
  const property = product ? "-p:P38ProductProfile=true" : "-p:P33CapabilityProfile=true";
  return {
    name: product ? "product" : "development",
    artifactDirectory: product ? "product-capability" : "capability",
    setupProperties: product ? [property] : [],
    frameworkPublishArguments: (project, destination) => [
      "publish", project, "--configuration", "Release", "--self-contained", "false",
      "--no-restore", "--nologo", "--output", destination, "-p:PlatformTarget=x64",
      "-p:DebugType=None", "-p:DebugSymbols=false", property
    ]
  };
};

module.exports = { selectCapabilityBuildProfile };

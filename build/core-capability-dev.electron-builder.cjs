const packageJson = require("../package.json");

const base = packageJson.build;

module.exports = {
  ...base,
  appId: "Cap7CE.Core.P33c.Dev",
  productName: "Cap7CE Core P3.3c Development",
  extraMetadata: {
    ...base.extraMetadata,
    name: "cap7ce-core-p33c-development",
    productName: "Cap7CE Core P3.3c Development"
  },
  directories: {
    ...base.directories,
    output: "release/core-capability-dev"
  },
  extraResources: [
    ...base.extraResources.filter((entry) => entry.to !== "core-capability/v1"),
    {
      from: "core/artifacts/capability/v1/bundle",
      to: "core-capability/v1",
      filter: ["**/*"]
    }
  ],
  win: {
    ...base.win,
    executableName: "Cap7CE-Core-P33c-Development"
  },
  nsis: {
    ...base.nsis,
    artifactName: "Cap7CE-Core-P33c-Dev-Setup-${version}-x64.${ext}",
    createDesktopShortcut: false,
    createStartMenuShortcut: false,
    shortcutName: "Cap7CE Core P3.3c Development",
    runAfterFinish: false,
    include: "build/installer-core-capability-dev.nsh"
  }
};

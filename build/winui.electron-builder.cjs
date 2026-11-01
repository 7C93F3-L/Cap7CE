const { build } = require('../package.json');
module.exports = {
  ...build, extends: null,
  // Required by the NSIS tool's framework metadata even with --prepackaged.
  // No Electron download, executable, or application payload is used.
  electronVersion: '43.2.0',
  files: [], extraResources: [],
  extraMetadata: { description: '' },
  directories: { output: 'release/winui-installer', buildResources: 'build' },
  win: { ...build.win, executableName: 'Cap7CE', signAndEditExecutable: false },
  nsis: { ...build.nsis, artifactName: 'Cap7CE-Setup-${version}-x64.${ext}',
    include: 'build/installer-winui.nsh' }
};

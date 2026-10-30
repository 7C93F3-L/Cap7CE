const { build } = require('../package.json');
module.exports = {
  ...build, extends: null,
  files: [], extraResources: [],
  directories: { output: 'release/winui-installer', buildResources: 'build' },
  win: { ...build.win, executableName: 'Cap7CE', signAndEditExecutable: false },
  nsis: { ...build.nsis, artifactName: 'Cap7CE-WinUI-Setup-${version}-x64.${ext}',
    include: 'build/installer-winui.nsh' }
};

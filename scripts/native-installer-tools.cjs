// Independent, hash-pinned NSIS toolchain. Nothing is installed or registered in Windows.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const directory = path.resolve(__dirname, '../artifacts/toolchains');
const archives = [
  ['7zr.exe', 'https://github.com/ip7z/7zip/releases/download/25.01/7zr.exe', '27cbe3d5804ad09e90bbcaa916da0d5c3b0be9462d0e0fb6cb54be5ed9030875'],
  ['7zip.exe', 'https://github.com/ip7z/7zip/releases/download/25.01/7z2501-x64.exe', '78afa2a1c773caf3cf7edf62f857d2a8a5da55fb0fff5da416074c0d28b2b55f', '7zip/7z.exe', '7zip'],
  ['nsis.zip', 'https://downloads.sourceforge.net/project/nsis/NSIS%203/3.12/nsis-3.12.zip', '56581f90db321581c5381193d796fffcf2d24b2f8fed2160a6c6a3baa67f2c4f', 'nsis-3.12/makensis.exe', '.'],
  ['stdutils.zip', 'https://github.com/lordmulder/stdutils/releases/download/1.14/StdUtils.2018-10-27.zip', '3ffe893dc7477fdb1cac551a86ae017509e1f2d0ebdc7185fd0fbaf20870688c', 'stdutils/Plugins/Unicode/StdUtils.dll', 'stdutils'],
  ['winshell.zip', 'https://nsis.sourceforge.io/mediawiki/images/5/54/WinShell.zip', '34e111f8aacf64c540d848fd06b9d6f3e2c10cb825ec9329a01d1141973e749b', 'winshell/Plugins/x86-unicode/WinShell.dll', 'winshell']
];
const run = (exe, args) => {
  const result = spawnSync(exe, args, { windowsHide: true, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw result.error || Error(result.stdout + result.stderr);
};
async function ensure() {
  if (process.platform !== 'win32') throw Error('Installer tools require Windows.');
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, url, hash, entry, output] of archives) {
    const file = path.join(directory, name);
    if (!fs.existsSync(file)) {
      console.log(`Downloading installer tool: ${name}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw Error(`Tool download failed: ${url} (${response.status})`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== hash) throw Error(`Tool checksum mismatch: ${name}`);
      fs.writeFileSync(file, bytes);
    }
    if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== hash)
      throw Error(`Tool checksum mismatch: ${name}; remove the damaged archive before retrying.`);
    if (entry && !fs.existsSync(path.join(directory, entry))) {
      run(path.join(directory, name === '7zip.exe' ? '7zr.exe' : '7zip/7z.exe'), ['x', '-y', `-o${path.join(directory, output)}`, file]);
    }
  }
}
module.exports = {
  ensure,
  async getMakeNsisPath() { await ensure(); return { path: path.join(directory, 'nsis-3.12/makensis.exe'), env: { NSISDIR: path.join(directory, 'nsis-3.12') } }; },
  getSevenZipPath() { return path.join(directory, '7zip/7z.exe'); },
  directory
};
if (require.main === module) ensure().then(() => console.log('Independent installer tools ready.')).catch(error => { console.error(error); process.exitCode = 1; });

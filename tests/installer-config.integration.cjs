const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const mainSource = fs.readFileSync(path.join(projectRoot, "electron", "main.ts"), "utf8");
const customNsis = fs.readFileSync(path.join(projectRoot, "build", "installer-custom.nsh"), "utf8");
const bitmap = fs.readFileSync(path.join(projectRoot, "build", "installerSidebar.bmp"));

assert.equal(packageJson.version, "1.0.4");
assert.equal(packageJson.build.appId, "Cap7CE");
assert.ok(packageJson.description, "the source package should retain its project description");
assert.equal(packageJson.build.extraMetadata.description, "");
assert.match(mainSource, /windowsAppUserModelId = "Cap7CE"/);

assert.deepEqual(packageJson.build.win.target, [{ target: "nsis", arch: ["x64"] }]);
assert.equal(packageJson.build.nsis.oneClick, false);
assert.equal(packageJson.build.nsis.perMachine, false);
assert.equal(packageJson.build.nsis.allowElevation, true);
assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
assert.equal(packageJson.build.nsis.artifactName, "Cap7CE-Setup-${version}-x64.${ext}");
assert.equal(packageJson.build.nsis.createDesktopShortcut, "always");
assert.equal(packageJson.build.nsis.createStartMenuShortcut, true);
assert.equal(packageJson.build.nsis.runAfterFinish, true);
assert.equal(packageJson.build.nsis.deleteAppDataOnUninstall, false);
assert.deepEqual(packageJson.build.nsis.installerLanguages, ["en_US", "zh_CN"]);
assert.equal(packageJson.build.nsis.displayLanguageSelector, false);
assert.equal(packageJson.build.nsis.license, "LICENSE");
assert.equal(packageJson.build.nsis.installerIcon, "build/setup.ico");
assert.equal(packageJson.build.nsis.uninstallerIcon, "build/setup.ico");
assert.equal(packageJson.build.nsis.include, "build/installer-custom.nsh");
assert.equal(packageJson.build.nsis.script, undefined, "the standard electron-builder NSIS script must remain in control");

assert.equal(packageJson.scripts.dist, undefined);
assert.match(packageJson.scripts["dist:installer"], /electron-builder --win nsis --x64 --publish never/);

assert.match(customNsis, /!macro customRemoveFiles/);
assert.match(customNsis, /!macro customUnInstallSection/);
assert.match(customNsis, /!macro customUnInit/);
assert.match(customNsis, /!macro customPageAfterChangeDir/);
assert.match(customNsis, /!undef MUI_PAGE_CUSTOMFUNCTION_PRE/);
assert.match(customNsis, /!define MUI_PAGE_CUSTOMFUNCTION_PRE cap7ceInstallFilesPre/);
assert.match(customNsis, /Goto cap7ce_install_files_pre_done[\s\S]*Call instFilesPre/);
assert.equal((customNsis.match(/Section \/o/g) || []).length, 2);
assert.match(customNsis, /0x400/, "recursive cleanup must detect reparse points");
assert.match(customNsis, /GetFileAttributesW\(w r0\)i\.r1/);
assert.doesNotMatch(customNsis, /Exch \$R0/, "the cleanup path must use the same NSIS register passed to System::Call");
assert.match(customNsis, /SectionSetSize 0 \$\{ESTIMATED_SIZE\}/);
assert.match(customNsis, /SectionSetSize 1 0/);
assert.match(customNsis, /SectionSetSize 2 \$4/);
assert.doesNotMatch(customNsis, /GetSize.*\$APPDATA/, "uninstaller startup must not recursively size shared user data");
assert.match(customNsis, /LangString cap7ceCleanupUserData 1033 "Remove user data"/);
assert.match(customNsis, /LangString cap7ceCleanupUserData 2052 "删除用户数据"/);
assert.doesNotMatch(customNsis, /affects all copies|影响所有副本/);
assert.match(customNsis, /!define APP_DESCRIPTION ""/);
assert.match(customNsis, /!undef UNINSTALL_URL_INFO_ABOUT/);
assert.match(customNsis, /\$INSTDIR\\models/);
assert.match(customNsis, /\$INSTDIR\\llama\.cpp/);
assert.doesNotMatch(customNsis, /CreateDirectory "\$INSTDIR\\(?:models|llama\.cpp)"/);
assert.match(customNsis, /\$INSTDIR\\resources\\app\.asar/);
assert.match(customNsis, /\$LOCALAPPDATA\\\$\{APP_INSTALLER_STORE_FILE\}/);

assert.equal(bitmap.toString("ascii", 0, 2), "BM");
assert.equal(bitmap.readInt32LE(18), 164);
assert.equal(bitmap.readInt32LE(22), 314);
assert.equal(bitmap.readUInt16LE(28), 24);
assert.equal(bitmap.readUInt32LE(30), 0, "installer sidebar bitmap must be uncompressed");

const width = bitmap.readInt32LE(18);
const height = bitmap.readInt32LE(22);
const rowSize = Math.ceil((width * 3) / 4) * 4;
const pixelOffset = bitmap.readUInt32LE(10);
assert.ok(bitmap.length >= pixelOffset + rowSize * height, "installer sidebar bitmap pixel data is truncated");

let darkest = 255;
let lightest = 0;
for (let y = 0; y < height; y += 1) {
  const sourceY = height - y - 1;
  const row = pixelOffset + sourceY * rowSize;
  for (let x = 0; x < width; x += 1) {
    const offset = row + x * 3;
    const pixel = [bitmap[offset + 2], bitmap[offset + 1], bitmap[offset]];
    const luminance = Math.round((pixel[0] + pixel[1] + pixel[2]) / 3);
    darkest = Math.min(darkest, luminance);
    lightest = Math.max(lightest, luminance);
  }
}
assert.ok(darkest < 48 && lightest > 224, `installer sidebar bitmap contrast is invalid: ${darkest}-${lightest}`);

console.log("installer configuration integration test passed");

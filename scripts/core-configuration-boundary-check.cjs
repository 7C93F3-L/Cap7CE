const fs = require("node:fs"), path = require("node:path");
const directory = "core/src/Cap7CE.Core.Configuration", host = `${directory}.Host`;
module.exports.projects = () => [
  [`${directory}/Cap7CE.Core.Configuration.csproj`, []],
  [`${host}/Cap7CE.Core.Configuration.Host.csproj`, [`${directory}/Cap7CE.Core.Configuration.csproj`]]
];
module.exports.register = projects => {
  for (const [name, references] of module.exports.projects()) projects.set(name, references);
  projects.get("core/tests/Cap7CE.Core.Tests/Cap7CE.Core.Tests.csproj").push(`${directory}/Cap7CE.Core.Configuration.csproj`);
  return projects;
};
module.exports.ownsStorage = name => ["FavoriteConfigurationFile.cs", "FavoriteConfigurationLease.cs"].some(file => name === `${directory}/${file}`);
module.exports.check = (root, failures) => {
  const files = new Map([
    ["FavoriteDirectory.cs", 10], ["FavoriteDirectoryRules.cs", 55], ["FavoriteDirectoryJson.cs", 55],
    ["FavoriteConfigurationFile.cs", 50], ["FavoriteDirectoryRegistry.cs", 55], ["FavoriteConfigurationLease.cs", 25], ["FavoriteUnicodeKey.cs", 40]
  ].map(([file, limit]) => [`${directory}/${file}`, limit]));
  files.set(`${host}/Program.cs`, 25); files.set(`${host}/FavoriteConfigurationSession.cs`, 50);
  for (const parent of [directory, host]) for (const name of fs.readdirSync(path.join(root, parent)).filter(name => name.endsWith(".cs")))
    if (!files.has(`${parent}/${name}`)) failures.push(`${parent}/${name} is not registered in configuration ownership.`);
  for (const [name, maximum] of files) {
    const source = fs.readFileSync(path.join(root, name), "utf8");
    if (source.split(/\r?\n/).length > maximum) failures.push(`${name} exceeds its single configuration responsibility (${maximum}).`);
    if (/System\.Net|HttpClient|Socket\b|Microsoft\.Data|Sqlite|Reader\.Host|DeviceIoControl|Process\.|DllImport|PeriodicTimer|EnumerateFiles|GetFiles|Directory\.(?:Delete|Move)|File\.(?:Copy|ReadAll|WriteAll)/.test(source))
      failures.push(`${name} bypasses the isolated configuration boundary.`);
  }
  const adapter = fs.readFileSync(path.join(root, "electron/favoriteDirectories/favoriteDirectoryStore.ts"), "utf8");
  if (/node:fs|randomUUID|JSON\.(?:parse|stringify)|readFile|writeFile|cached/.test(adapter) || !adapter.includes("requestCoreConfiguration"))
    failures.push("Electron favorite adapter must not retain a second configuration implementation.");
  const file = fs.readFileSync(path.join(root, directory, "FavoriteConfigurationFile.cs"), "utf8");
  for (const anchor of ["MaximumBytes + 1", "FileMode.CreateNew", "if (created && File.Exists(temporary))", "File.Move(temporary, path, overwrite: true)", "flushToDisk: true"])
    if (!file.includes(anchor)) failures.push(`Core favorite publication requires ${anchor}.`);
  const client = fs.readFileSync(path.join(root, "electron/core/coreConfigurationClient.ts"), "utf8");
  if (client.split(/\r?\n/).length > 50 || !client.includes("shell: false") || !client.includes("maximumBytes + 132"))
    failures.push("Core configuration transport must remain bounded and use private child streams without shell evaluation.");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (!pkg.build.extraResources.some(resource => resource.to === "core-configuration/v1" && resource.filter?.length === 1 && resource.filter[0] === "Cap7CE.Core.Configuration.Host.exe"))
    failures.push("Configuration packaging must carry only the native ordinary-user host.");
};

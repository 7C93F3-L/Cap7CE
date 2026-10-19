const fs = require("node:fs"), path = require("node:path");
const projects = ["Catalog", "Host", "Reader.Host"];
module.exports.allowedPackages = new Map([
  ["core/src/Cap7CE.Core.Catalog/Cap7CE.Core.Catalog.csproj", [["Microsoft.Data.Sqlite", "10.0.12"]]],
  ["core/src/Cap7CE.Core.Reader.Host/Cap7CE.Core.Reader.Host.csproj", [["Microsoft.NET.ILLink.Tasks", "10.0.12"]]]
]);
// Metadata/attribute ordering must not hide an added dependency from the architecture guard.
module.exports.packages = source => [...source.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<PackageReference\b([^>]*?)\/?\s*>/g)]
  .map(([, attributes]) => ["Include", "Version"].map(key => new RegExp(`\\b${key}\\s*=\\s*"([^"]+)"`).exec(attributes)?.[1] ?? ""));
module.exports.check = (root, failures) => {
  for (const project of projects) {
    const source = fs.readFileSync(path.join(root, `core/src/Cap7CE.Core.${project}/Cap7CE.Core.${project}.csproj`), "utf8");
    if (!source.includes("<RuntimeIdentifiers>win-x64</RuntimeIdentifiers>") || /<RuntimeIdentifier>/.test(source))
      failures.push(`Core ${project} must restore the fixed Windows graph without forcing a self-contained runtime.`);
    if (project === "Reader.Host" && (!source.includes('PrivateAssets="all"')
      || !source.includes("'$(PublishAot)' != 'true' And '$(PublishTrimmed)' != 'true'")))
      failures.push("Reader linker tools must remain private build-only dependencies with SDK ownership in native/trimmed profiles.");
  }
  const script = fs.readFileSync(path.join(root, "scripts/core-development-host-build.cjs"), "utf8");
  if (script.indexOf('runDotnet(["restore"') > script.indexOf("fs.rmSync(outputRoot"))
    failures.push("Failed locked restore must preserve the last working development host.");
  if (!script.includes(".assertStopped(outputRoot)") || script.indexOf(".assertStopped(outputRoot)") > script.indexOf("fs.rmSync(outputRoot"))
    failures.push("Development publishing must reject an active owner before output cleanup.");
  const safety = fs.readFileSync(path.join(root, "scripts/core-development-host-safety.cjs"), "utf8");
  if (!safety.includes("Get-CimInstance Win32_Process") || !safety.includes("CAP7CE_DEVELOPMENT_OUTPUT")
    || /Remove-Item|Set-ItemProperty|Stop-Process|Start-Process|fs\.|writeFile|unlinkSync/.test(safety))
    failures.push("Development owner detection must remain a read-only process check.");
  const config = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (!config.scripts["test:core"].includes("test:core-restore-profiles")) failures.push("Core regression must validate lock stability across supported profiles.");
};

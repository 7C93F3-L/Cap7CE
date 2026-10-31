const fs = require("node:fs");
const path = require("node:path");

module.exports = (root, sourceFiles, failures) => {
  const directory = "core/src/Cap7CE.Core.Host/CatalogStorage";
  const limits = { "CatalogStorageLease.cs": 30, "CatalogOfflineStorage.cs": 45, "CatalogEntryMaintenance.cs": 65, "CatalogHealthCheck.cs": 44 };
  if (JSON.stringify(fs.readdirSync(path.join(root, directory)).sort()) !== JSON.stringify(Object.keys(limits).sort()))
    failures.push("Catalog storage lifecycle contains unregistered sources.");
  const sources = {};
  for (const [name, maximum] of Object.entries(limits)) {
    const source = sources[name] = fs.readFileSync(path.join(root, directory, name), "utf8");
    if (source.split(/\r?\n/).length > maximum) failures.push(`${directory}/${name} exceeds its lifecycle boundary.`);
    if (/System\.Net|HttpClient|Process\.|DeviceIoControl|AdjustTokenPrivileges|DllImport|Reader\.Host|Directory\.(?:Delete|Move|Enumerate|GetFiles)|File\.(?:Copy|Write|ReadAll)|PeriodicTimer|Task\.Delay/.test(source))
      failures.push(`${directory}/${name} bypasses its offline Catalog-only boundary.`);
  }
  const health = sources["CatalogHealthCheck.cs"].replace(/\/\/[^\r\n]*/g, "");
  if (!health.includes("SqliteOpenMode.ReadWrite,") || health.includes("ReadWriteCreate")
      || health.indexOf("PRAGMA query_only=ON;") < 0 || health.indexOf("PRAGMA query_only=ON;") > health.indexOf("PRAGMA quick_check;"))
    failures.push("Health checks must use an existing database and enforce query-only before inspection.");
  if (/INSERT INTO|UPDATE |DELETE FROM|CREATE TABLE|DROP TABLE/.test(health)) failures.push("Health checks must not repair or mutate Catalog storage.");
  for (const [name, anchors] of Object.entries({
    "CatalogStorageLease.cs": ["FileShare.None", "FileAttributes.ReparsePoint", "handle.Dispose()"],
    "CatalogOfflineStorage.cs": ["FileMode.Open", "FileShare.None", "SqliteOpenMode.ReadWrite", "Pooling = false", "PRAGMA wal_checkpoint(TRUNCATE)", "PRAGMA quick_check", "token.ThrowIfCancellationRequested()"],
    "CatalogEntryMaintenance.cs": ["CatalogStorageLease.Acquire", "CatalogOfflineStorage.PrepareAsync", "checkpoint.Revision", "EnablePreparedAsync", "File.Replace(stage.Path, path, archive, false)", "if (!consumed && File.Exists(stage.Path)) File.Delete(stage.Path)"]
  })) {
    for (const anchor of anchors) if (!sources[name].includes(anchor))
      failures.push(`Catalog storage ${name} is missing ${anchor}.`);
  }
  const upgrade = sources["CatalogEntryMaintenance.cs"];
  if (upgrade.indexOf("CatalogEntryRecoveryCheckpoint.CreateAsync") > upgrade.indexOf("activation.EnablePreparedAsync"))
    failures.push("Catalog entry activation must follow its completed recovery checkpoint.");
  for (const name of ["Program.cs", "ProductCoreRuntime.cs"])
    if (/CatalogEntryMaintenance|UpgradeAsync|RollbackAsync/.test(fs.readFileSync(path.join(root, "core/src/Cap7CE.Core.Host", name), "utf8")))
      failures.push("Ordinary startup must not implicitly upgrade or roll back existing Catalog storage.");
};

// Exact source ownership stays with this domain rather than growing the global
// architecture policy each time a storage-lifecycle responsibility is separated.
module.exports.ownsStorageSource = (relativePath) => [
  "CatalogStorage/CatalogHealthCheck.cs", "CatalogStorage/CatalogStorageLease.cs", "CatalogStorage/CatalogOfflineStorage.cs", "CatalogStorage/CatalogEntryMaintenance.cs",
  "MetadataRecovery/FileFactRecoveryCheckpoint.cs", "MetadataRecovery/CatalogRecoverySnapshotWriter.cs", "MetadataRecovery/CatalogEntryRecoveryCheckpoint.cs"
].some(name => relativePath === `core/src/Cap7CE.Core.Host/${name}`);

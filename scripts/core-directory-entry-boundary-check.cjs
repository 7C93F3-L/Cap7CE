const fs = require("node:fs");
const path = require("node:path");

module.exports = (root, sourceFiles, failures) => {
  const limits = { "CatalogFileEntry.cs": 45, "CatalogFileEntrySchema.cs": 55, "CatalogFileEntryStore.cs": 140, "CatalogEntryQuerySource.cs": 50 };
  const directory = "core/src/Cap7CE.Core.Catalog/DirectoryEntries";
  for (const [name, maximum] of Object.entries(limits)) {
    const source = fs.readFileSync(path.join(root, directory, name), "utf8");
    if (source.split(/\r?\n/).length > maximum) failures.push(`${directory}/${name} exceeds its entry-store boundary.`);
    if (/System\.Net|HttpClient|Process\.|File\.|Directory\.|FileStream|DeviceIoControl|DllImport|Reader\.Host/.test(source))
      failures.push(`${directory}/${name} must remain database-only, without discovery, native IO or source access.`);
  }
  const store = fs.readFileSync(path.join(root, directory, "CatalogFileEntryStore.cs"), "utf8");
  if (/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM)?\s*(?:file_fact|catalog_manual_keywords|catalog_nodes_v2)\b/i.test(store))
    failures.push("File entry storage must not alter physical facts, source nodes or annotations.");
  for (const required of ["expectedVolumeRevision", "source.CreatedUtcTicks", "transaction.Commit()", "token.ThrowIfCancellationRequested()"])
    if (!store.includes(required)) failures.push(`File entry publication is missing ${required}.`);
  const native = fs.readFileSync(path.join(root, "core/src/Cap7CE.Core.Reader.Host/DirectoryEntries/ReaderHardLinkMetadata.cs"), "utf8");
  if (native.split(/\r?\n/).length > 65 || /DeviceIoControl|AdjustTokenPrivileges|System\.Net|HttpClient|Process\.|(?:File|Directory)\.|WriteFile|CreateFile|CreateHardLink|SetFileInformation/.test(native))
    failures.push("Reader entry metadata must remain a bounded query on an existing attribute handle, without paths, content or writes.");
  for (const required of ["FileHardLinkInformation = 46", "MaximumBufferBytes = 1024 * 1024", "expectedCount is < 1 or > 1024", "ReaderHardLinkBuffer.Decode"])
    if (!native.includes(required)) failures.push(`Reader entry metadata is missing ${required}.`);
  const readerDomain = "core/src/Cap7CE.Core.Reader.Host/DirectoryEntries";
  const readerLimits = { "ReaderHardLinkMetadata.cs": 45, "ReaderHardLinkBuffer.cs": 45, "ReaderNtfsFileEntries.cs": 60 };
  if (JSON.stringify(fs.readdirSync(path.join(root, readerDomain)).sort()) !== JSON.stringify(Object.keys(readerLimits).sort()))
    failures.push("Reader entry metadata domain contains unregistered sources.");
  for (const [name, cap] of Object.entries(readerLimits)) {
    const source = fs.readFileSync(path.join(root, readerDomain, name), "utf8");
    if (source.split(/\r?\n/).length > cap) failures.push(`${name} exceeds its bounded metadata responsibility.`);
    if (/FileReadData|GenericRead|WriteFile|WriteData|AdjustTokenPrivileges|Process\.|System\.Net|Microsoft\.Data/.test(source))
      failures.push(`${name} broadens Reader metadata permissions.`);
  }
  for (const [file, cap] of Object.entries({
    "core/src/Cap7CE.Core.Reader.Protocol/ReaderFileEntryCodec.cs": 110,
    "core/src/Cap7CE.Core.Host/DirectoryEntries/ReaderFileEntryClient.cs": 55,
    "core/src/Cap7CE.Core.Catalog/Queries/CatalogQueryScopeSql.cs": 35,
    "core/src/Cap7CE.Core.Catalog/CatalogV2Database.cs": 1216
  })) if (fs.readFileSync(path.join(root, file), "utf8").split(/\r?\n/).length > cap)
    failures.push(`${file} exceeds its entry metadata boundary.`);
};

const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const recovery = read('core/src/Cap7CE.Core.Catalog/FileFacts/CatalogFactRecovery.cs');
const synchronization = read('core/src/Cap7CE.Core.Host/CatalogSynchronizationService.cs');
const publication = read('core/src/Cap7CE.Core.Catalog/Snapshots/CatalogSnapshotPublication.cs');
const client = read('core/src/Cap7CE.Core.Host/ReaderV2CatalogSession.cs');
const monitor = read('core/src/Cap7CE.Core.Host/CatalogMaintenance/CatalogJournalMonitor.cs');
const retention = read('core/src/Cap7CE.Core.Catalog/Snapshots/CatalogSnapshotRetention.cs');
const failures = [];
if (recovery.split(/\r?\n/).length > 170) failures.push('Recovery staging exceeds its single-purpose size limit.');
for (const pattern of [/DeviceIoControl|DllImport|Reader\.Host|FileStream/, /Process\.|System\.Net|HttpClient/, /ALTER TABLE|UPDATE catalog_nodes_v2|UPDATE file_fact_volumes/])
  if (pattern.test(recovery)) failures.push('Recovery bypasses the Catalog or source freshness boundary.');
for (const anchor of ['u.usn<$checkpoint', 'fv.epoch=$epoch', 'ff.volume_epoch=$oldEpoch', 'ff.content_revision=COALESCE(fs.content_revision,0)',
  'ff.extractor_version=f.extractor_version', 'n.created_utc_ticks=f.created_utc_ticks', 'n.extension=f.extension',
  'n.size_bytes=f.size_bytes', 'n.modified_utc_ticks=f.modified_file_time', 'CatalogV2Database.DeleteSnapshotBuildFiles', '.Chunk(400)'])
  if (!recovery.includes(anchor)) failures.push(`Recovery is missing ${anchor}.`);
for (const anchor of ['!forceRebuild && reason == "checkpoint-expired"', 'catalogVolume.JournalId == inspection.JournalId.ToString("X16")'])
  if (!synchronization.includes(anchor)) failures.push(`Recovery activation is missing ${anchor}.`);
if (!monitor.includes('SynchronizeConnectedAsync(reader, [volumeId], forceRebuild: false, token, origin)'))
  failures.push('Automatic monitor recovery must not bypass verified fact retention by forcing an explicit rebuild.');
if (!synchronization.includes('CaptureFactRecoveryAsync(current, inspection, reason, false, token)')
    || !synchronization.includes('true, activity, reason, token, factRecovery)'))
  failures.push('Catch-up discontinuity recovery must preserve verified facts through the same snapshot publication owner.');
if (!client.includes('hello.Capabilities.HasFlag(ReaderCapabilities.SnapshotFileUsn)') || !client.includes('response.Payload.Span, supportsSnapshotFileUsn'))
  failures.push('Snapshot USNs must use explicit capability negotiation.');
if (publication.indexOf('retention.PrepareAsync') > publication.indexOf('INSERT INTO catalog_nodes_v2')
    || publication.indexOf('retention.PrepareAsync') < publication.indexOf('connection.BeginTransaction()'))
  failures.push('Fact restoration must share snapshot publication transaction before source replacement.');
if (retention.split(/\r?\n/).length > 100) failures.push('Retained snapshot owner exceeds its size limit.');
const beginRetention = retention.slice(retention.indexOf('public async Task<CatalogV2SnapshotBuild> BeginRetainedSnapshotBuildAsync'));
if (/ApplyVolumeAsync|SET journal_id|SET checkpoint_usn|DELETE FROM|ALTER TABLE|File\.|Directory\.|Process\./.test(beginRetention))
  failures.push('Retained staging must keep the original durable source and checkpoint without sidecar lifecycle or schema changes.');
for (const anchor of ['recovery.CatalogPath', 'volume.CatalogRevision != recovery.SourceRevision', 'volume.CheckpointUsn != recovery.Checkpoint',
    'state=\'catchingUp\'', 'RequireEpochAsync', 'FileFactCatalogInvalidation.ApplyVolumeAsync', 'recovery.RestoreAsync', 'checked(recovery.Epoch + 1)'])
  if (!retention.includes(anchor)) failures.push(`Retained source fence is missing ${anchor}.`);
if (!monitor.includes('includeInterrupted && (volume.State is CatalogV2VolumeState.NeedsRebuild or CatalogV2VolumeState.CatchingUp)'))
  failures.push('Startup must resume retained catching-up snapshots.');
if (!synchronization.includes('BeginRetainedSnapshotBuildAsync') || !synchronization.includes('if (factRecovery is null) current = await catalog.MarkNeedsRebuildAsync'))
  failures.push('Retained snapshots must bypass pre-publication invalidation.');
if (failures.length) throw Error(failures.join('\n'));
console.log('Checkpoint-expiry fact recovery boundaries passed.');

const assert = require('node:assert/strict');
module.exports = read => {
  assert(read('native/Cap7CE.Core.Visuals/pdf_thumbnail.cpp').trimEnd().split(/\r?\n/).length <= 45, 'PDF native decoder size boundary');
  const anchors = {
    'native/Cap7CE.Core.Visuals/pdf_thumbnail.cpp': ['PdfDocument::LoadFromFileAsync', 'document.GetPage(0)', '16000000', '40 * 1024 * 1024'],
    'core/node/visualRendering/shell/coreShellThumbnail.ts': ['--pdf-thumbnail', 'child.kill()', 'timeoutMs = 15000'],
    'core/node/visualCache/store.ts': ['createVisualCachePublications()', 'publicationOwner', 'createHmac("sha256", secret)', 'verifyEntry(entry)', 'maximumConcurrentCacheStatReads = 2'],
    'core/node/visualCache/publication.ts': ['visualCacheEpoch'],
    'core/node/visualRendering/renderSource.ts': ['sharp.concurrency(2)', 'memory: 64', 'files: 20', 'items: 100', 'maxWidth: 1536', 'jpegQuality: 90', 'maxWidth: 2560', 'withoutEnlargement: true', 'visualScratchDirectory()'],
    'core/node/visualRendering/preparation.ts': ['this.store.writeVisualCacheEntry', 'Promise.allSettled([...this.operations])'],
    'core/node/visualRendering/workerSlot.ts': ['--max-old-space-size=256', 'timeoutMs = 60000', 'idleMs = 5000', '768 * 1024 * 1024', 'closeAndWait', 'CAP7CE_VISUAL_SCRATCH', 'path.dirname(scratch) !== temporaryRoot'],
    'core/node/interactiveMetadata/owner.ts': ['timeoutMs = 8000', 'this.jobs.size >= 4', 'this.active < 2', 'maxOldGenerationSizeMb: 256', 'job.worker?.terminate()', 'this.releasing'],
    'core/node/interactiveMetadata/worker.ts': ['before.ino === after.ino', 'before.mtimeNs === after.mtimeNs'],
    'core/node/storedMetadata/reader.ts': ['readOnly: true', 'allowExtension: false', 'LIMIT 64', 'ORDER BY evidence_kind LIMIT 13', 'trusted_schema=OFF'],
    'core/node/directoryBrowse/owner.ts': ['65536', '32 * 1024 * 1024', 'jobs.size >= 4', 'job.cancelled', 'Promise.allSettled'],
    'core/node/directoryBrowse/recursive.ts': ['examined > 65536', '16 * 1024 * 1024', 'directory-browse-invalid-descendant', 'this.checkCancelled()'],
    'core/node/sourceInformation/owner.ts': ['jobs.size >= 4', 'inspections.size >= 8', 'job.waiters.size >= 2', 'await job.work'],
    'core/node/modelRuntime/owner.ts': ['llamaRuntimeAiIdleTimeoutMs', 'this.queuedStarts>0', 'accepted!==this.revision', 'this.retiring', 'this.abort?.abort()', 'this.state.release()'],
    'core/node/modelRuntime/health.ts': ['hostname:"127.0.0.1"', 'proxyEnv:undefined', 'maximumBytes=1024*1024', 'agent.destroy()'],
    'core/node/localKeywords/requestHttp.ts': ['hostname: "127.0.0.1"', 'new http.Agent({ keepAlive: false', 'maximumResponseBytes = 1024 * 1024', 'agent.destroy()', 'path: "/v1/chat/completions"'],
    'core/node/fileFacts/domain/archiveMetadataReader.ts': ['restrictArchiveSourceFilesystem(module, filePath)', 'boundWasmMemory(bytes, 256 * 1024 * 1024)', 'module.callMain(["l", "-slt"'],
    'core/node/metadataExecution/metadataWorkerProcess.ts': ['sharp.concurrency(1)', 'sharp.cache(false)', 'process.on("disconnect", stop)'],
    'core/node/transport/server.ts': ['pending.size >= 64', '2 * maximumCacheFrameBytes', 'await owner.close()', 'await Promise.allSettled(pending); await output', 'slice(0, 1024)', 'serialMethods.includes']
  };
  for (const [file, values] of Object.entries(anchors))
    for (const value of values) assert(read(file).includes(value), `${file}: missing ownership/budget invariant ${value}`);
  for (const file of ['core/node/visualRendering/renderSource.ts', 'core/node/visualRendering/decoders/psdRenderService.ts'])
    assert(!/writeVisualCacheEntry|createVisualCacheEntry|visualCacheEpoch/.test(read(file)), `${file}: decoder regained cache publication`);
  for (const file of ['core/node/interactiveMetadata/worker.ts', 'core/node/storedMetadata/reader.ts', 'core/node/sourceInformation/inspection.ts', 'core/node/sourceInformation/folderStats.ts'])
    assert(!/fs\.(?:write|rename|rm|unlink|mkdir)|INSERT INTO|UPDATE |DELETE FROM|CREATE TABLE|ALTER TABLE/.test(read(file)), `${file}: read-only metadata boundary`);
};

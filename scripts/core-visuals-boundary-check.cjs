const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),directory='native/Cap7CE.Core.Visuals',read=file=>fs.readFileSync(path.join(root,file),'utf8');
const limits={'main.cpp':30,'platform.h':20,'job_runner.cpp':75,'job_control.cpp':20,'scratch.cpp':50,'scratch.h':15,'thumbnail.cpp':105,'icon_pixels.cpp':40,'icon_pixels.h':10};
assert.deepEqual(fs.readdirSync(path.join(root,directory)).sort(),Object.keys(limits).sort());
for(const[file,limit]of Object.entries(limits)){
  const text=read(`${directory}/${file}`);assert.ok(text.split(/\r?\n/).length<=limit,`${file} visual platform size`);
  assert.doesNotMatch(text,/ShellExecute|runas|CreateFileW|MoveFile|CopyFile|WinHttp|Sqlite|sqlite|SetTimer|Sleep\(|IFileOperation/i,`${file} ordinary visual-only boundary`);
  if(file!=='scratch.cpp')assert.doesNotMatch(text,/DeleteFile|RemoveDirectoryW|CreateDirectoryW/);
  if(file!=='job_runner.cpp')assert.doesNotMatch(text,/CreateProcess/);
}
const job=read(`${directory}/job_runner.cpp`);
for(const anchor of['SYNCHRONIZE','JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE','CREATE_SUSPENDED','PROC_THREAD_ATTRIBUTE_HANDLE_LIST','PROC_THREAD_ATTRIBUTE_JOB_LIST','IsProcessInJob','WaitForMultipleObjects','TerminateJobObject','CREATE_NO_WINDOW'])assert.ok(job.includes(anchor),anchor);
for(const anchor of['GetQueuedCompletionStatus','JOB_OBJECT_MSG_ACTIVE_PROCESS_ZERO','OwnedScratch','cancellation.value'])assert.ok(job.includes(anchor),anchor);
const scratch=read(`${directory}/scratch.cpp`);for(const anchor of['GetTempPathW','CoCreateGuid','CreateDirectoryW(root.c_str()','FILE_ATTRIBUTE_REPARSE_POINT','root.rfind(prefix, 0) != 0','root.size() != prefix.size() + 36'])assert.ok(scratch.includes(anchor),anchor);
assert.ok(job.indexOf('PROC_THREAD_ATTRIBUTE_JOB_LIST')<job.indexOf('CreateProcessW'));
assert.ok(job.indexOf('IsProcessInJob')<job.indexOf('ResumeThread'));
const thumbnail=read(`${directory}/thumbnail.cpp`);
for(const anchor of['CLSID_LocalThumbnailCache','WTS_SCALETOREQUESTEDSIZE | WTS_SCALEUP','GetSharedBitmap','DecodeIconPixels','40 * 1024 * 1024','16000000','32767','CreateThread','ParentEnded'])assert.ok(thumbnail.includes(anchor),anchor);
const builder=read('scripts/core-visuals-build.cjs');for(const anchor of['/MT','/WX','/MANIFEST:EMBED',"asInvoker",'assertStopped(output)'])assert.ok(builder.includes(anchor),anchor);
const client=read('electron/core/coreVisualCacheClient.ts');assert.ok(client.includes('spawn(this.supervisor'));assert.ok(client.includes('"--node-worker", "--parent-pid", String(process.pid)'));
assert.ok(client.includes('detached: true'));assert.ok(client.includes('stopCoreVisualHost'));assert.ok(client.includes('await Promise.allSettled([...this.exits])'));
const packageJson=JSON.parse(read('package.json'));
const native=packageJson.build.extraResources.find(resource=>resource.to==='core-visuals/v1');
assert.equal(native?.from,'native/artifacts/core-visuals/v1');assert.deepEqual(native?.filter,['Cap7CE.Core.Visuals.exe']);
assert.ok(packageJson.build.extraResources.some(resource=>resource.to==='licenses/chromium-visuals'&&resource.filter.includes('LICENSE')));
assert.ok(read('third_party/chromium-visuals/LICENSE').includes('Redistributions in binary form'));
console.log('Ordinary Windows visual adapter, inherited-handle/job ownership, source boundaries and exact native payload configuration/notice passed.');

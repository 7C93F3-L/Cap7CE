const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {getMakeNsisPath}=require('./native-installer-tools.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cap7ce-install-lifecycle-'));
const source=fs.readFileSync(path.join(__dirname,'../build/installer-custom.nsh'),'utf8');
(async()=>{try {
  const tool=await getMakeNsisPath();
  const run=(exe,args)=>spawnSync(exe,args,{encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,...tool.env}});
  const compile=(script,file)=>{
    const input=file+'.nsi';fs.writeFileSync(input,script);
    const result=run(tool.path,['/WX','/INPUTCHARSET','UTF8','/V2',input]);
    assert.equal(result.status,0,result.stdout+result.stderr);
  };
  for(const code of [0,1,3010,6]) {
    const fixture=path.join(root,String(code));fs.mkdirSync(fixture);
    fs.mkdirSync(path.join(fixture,'app'));
    const helper=path.join(fixture,'app/Cap7CE.exe'),installer=path.join(fixture,'install.exe');
    compile(`Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "${helper}"
Function .onInit
 FileOpen $0 "${fixture}\\arguments.txt" w
 FileWrite $0 "$CMDLINE"
 FileClose $0
 SetErrorLevel ${code}
 Quit
FunctionEnd
Section
SectionEnd
`,helper);
    compile(`Unicode true
RequestExecutionLevel user
SilentInstall silent
!define PRODUCT_FILENAME "Cap7CE"
OutFile "${installer}"
${source}
Section
 StrCpy $INSTDIR "${fixture}"
 !insertmacro customInstall
 FileOpen $0 "${fixture}\\completed.txt" w
 FileClose $0
SectionEnd
`,installer);
    const result=run(installer,['/S']);
    assert.equal(result.status,code,'installer must preserve the setup result');
    assert.equal(fs.existsSync(path.join(fixture,'completed.txt')),code===0,'setup failure must block normal completion');
    assert(fs.readFileSync(path.join(fixture,'arguments.txt'),'utf8').includes('--install-search-service'),'service setup is mandatory');
    assert(/--language (1033|2052)/.test(fs.readFileSync(path.join(fixture,'arguments.txt'),'utf8')),'installer language must reach the progress output');
  }
  const progress=spawnSync(process.execPath,[path.join(__dirname,'native-installer-progress-smoke.cjs')],
    {encoding:'utf8',windowsHide:true,timeout:90000});
  assert.equal(progress.status,0,progress.stdout+progress.stderr);process.stdout.write(progress.stdout);
  console.log('NSIS install fixtures passed: mandatory service setup, success, failure, restart and account mismatch. No product state changed.');
}finally{
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('cap7ce-install-lifecycle-'));
  fs.rmSync(root,{recursive:true,force:true});
}})().catch(error=>{console.error(error);process.exitCode=1;});

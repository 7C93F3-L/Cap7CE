$ErrorActionPreference='Stop'
$launchRoot=Split-Path $PSScriptRoot -Parent
Add-Type -Path (Join-Path $launchRoot 'shell/DesktopProcess.cs')
$launchOutput=Join-Path ([IO.Path]::GetTempPath()) ('Cap7CE-desktop-test-'+[Guid]::NewGuid().ToString('N')+'.json')
$launchSource=@'
$ErrorActionPreference='Stop'
try {
    Add-Type -TypeDefinition 'using System.Text; using System.Runtime.InteropServices; public static class LaunchPathProbe { [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern uint GetFinalPathNameByHandle(Microsoft.Win32.SafeHandles.SafeFileHandle h,StringBuilder text,uint size,uint flags); }'
    $source=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Cap7CE-PhaseF\shell-preferences.json'
    $result=[ordered]@{Root=$env:CAP7CE_LAUNCH_TEST;Requested=$source;Actual=$null;Color1=$null;Color2=$null}
    if(Test-Path -LiteralPath $source) {
        $stream=[IO.File]::Open($source,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
        try {
            $buffer=[Text.StringBuilder]::new(32768)
            if([LaunchPathProbe]::GetFinalPathNameByHandle($stream.SafeFileHandle,$buffer,32768,0) -eq 0){throw 'Cannot resolve config handle'}
            $result.Actual=$buffer.ToString()
            $prefs=Get-Content -LiteralPath $source -Raw | ConvertFrom-Json
            $result.Color1=$prefs.Color1;$result.Color2=$prefs.Color2
        }finally{$stream.Dispose()}
    }
    $result|ConvertTo-Json|Set-Content -LiteralPath '__OUTPUT__' -Encoding UTF8
}catch{ @{Error=$_.Exception.Message}|ConvertTo-Json|Set-Content -LiteralPath '__OUTPUT__' -Encoding UTF8;exit 1 }
'@
$launchSource=$launchSource.Replace('__OUTPUT__',$launchOutput.Replace("'","''"))
$launchEncoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launchSource))
# Exercise a normal grandchild too, as WinUI starts Core/Node with Process.Start.
$launchBootstrap=@'
$info=[Diagnostics.ProcessStartInfo]::new((Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'))
$info.UseShellExecute=$false;$info.CreateNoWindow=$true
$info.Arguments='-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand __PROBE__'
$child=[Diagnostics.Process]::Start($info)
try{if(!$child.WaitForExit(10000)){$child.Kill();exit 2};exit $child.ExitCode}finally{$child.Dispose()}
'@
$launchBootstrap=$launchBootstrap.Replace('__PROBE__',$launchEncoded)
$launchEncoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launchBootstrap))
$launchOld=$env:CAP7CE_LAUNCH_TEST
try {
    $env:CAP7CE_LAUNCH_TEST='Cap7CE desktop launch environment'
    $launchId=[Cap7CEDesktopProcess]::Start((Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'),('-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand '+$launchEncoded),$launchRoot)
    $launchProcess=[Diagnostics.Process]::GetProcessById($launchId)
    try{if(!$launchProcess.WaitForExit(12000)){Stop-Process -Id $launchId;throw 'Launch probe timed out'}}finally{$launchProcess.Dispose()}
    $launchResult=Get-Content -LiteralPath $launchOutput -Raw | ConvertFrom-Json
    if($launchResult.Error){throw $launchResult.Error}
    if($launchResult.Root -ne $env:CAP7CE_LAUNCH_TEST){throw 'Development environment was not inherited'}
    if($launchResult.Actual -and $launchResult.Actual -ne ('\\?\'+$launchResult.Requested)){throw 'Preference read was redirected away from its requested path'}
    $launchResult|ConvertTo-Json
    if(!$launchResult.Actual){'No existing preference file; file-handle assertion skipped.'}
    'Desktop launch checks passed (inherited environment and ordinary grandchild process).'
}finally {
    $env:CAP7CE_LAUNCH_TEST=$launchOld
    if(Test-Path -LiteralPath $launchOutput){Remove-Item -LiteralPath $launchOutput}
}

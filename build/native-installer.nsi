Unicode true
RequestExecutionLevel admin
ManifestDPIAware true
SetCompressor /SOLID lzma
SetCompressorDictSize 32
Name "Cap7CE ${VERSION}"
OutFile "${OUTPUT_FILE}"
InstallDir "$PROGRAMFILES64\Cap7CE"
InstallDirRegKey HKLM "Software\d4b3d470-3007-5bc8-86ae-83016c5ca854" "InstallLocation"
ShowInstDetails show
ShowUninstDetails show
SpaceTexts none
!define PRODUCT_FILENAME "Cap7CE"
!define APP_ID "Cap7CE"
!define APP_INSTALLER_STORE_FILE "cap7ce-updater\installer.exe"
!define UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\d4b3d470-3007-5bc8-86ae-83016c5ca854"
!define BUILD_UNINSTALLER
!include MUI2.nsh
!include LogicLib.nsh
!include FileFunc.nsh
!include Sections.nsh
!include x64.nsh
!addincludedir "${TOOLCHAIN_DIR}\stdutils\Include"
!addplugindir /x86-unicode "${TOOLCHAIN_DIR}\stdutils\Plugins\Unicode"
!addplugindir /x86-unicode "${TOOLCHAIN_DIR}\winshell\Plugins\x86-unicode"
!include StdUtils.nsh
Var installMode
Var updating
!macro _isUpdated _a _b _t _f
  StrCmp $updating "1" `${_t}` `${_f}`
!macroend
!define isUpdated `"" isUpdated ""`
!include "${PROJECT_DIR}\build\installer-custom.nsh"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Cap7CE"
VIAddVersionKey /LANG=1033 "CompanyName" "7C93F3-L"
VIAddVersionKey /LANG=1033 "FileDescription" ""
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}.0"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright © 2026 7C93F3-L"
!define MUI_ICON "${PROJECT_DIR}\build\setup.ico"
!define MUI_UNICON "${PROJECT_DIR}\build\setup.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${PROJECT_DIR}\build\installerSidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${PROJECT_DIR}\build\installerSidebar.bmp"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${PROJECT_DIR}\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApplication
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_COMPONENTS
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"
LangString closeApplication 1033 "Close Cap7CE, including its tray icon, then retry."
LangString closeApplication 2052 "请退出 Cap7CE（包括托盘）后重试。"
LangString invalidInstallDirectory 1033 "This directory contains an unknown app folder or a directory link. Choose another directory."
LangString invalidInstallDirectory 2052 "此目录包含未知 app 文件夹或目录链接，请选择其他目录。"

!macro Initialize
  SetRegView 64
  SetShellVarContext all
  StrCpy $installMode "all"
  StrCpy $updating "0"
  ${IfNot} ${RunningX64}
    SetErrorLevel 1
    Quit
  ${EndIf}
  System::Call 'kernel32::GetUserDefaultUILanguage()i.r0'
  IntOp $0 $0 & 0x3ff
  ${If} $0 == 4
    StrCpy $LANGUAGE 2052
  ${Else}
    StrCpy $LANGUAGE 1033
  ${EndIf}
!macroend
Function .onInit
  !insertmacro Initialize
  # Read the existing machine-wide registration explicitly in the 64-bit view.
  # Preserve an explicit /D path; the directory page always remains editable.
  ${If} $INSTDIR == "$PROGRAMFILES64\Cap7CE"
    ReadRegStr $0 HKLM "Software\d4b3d470-3007-5bc8-86ae-83016c5ca854" "InstallLocation"
    ${If} $0 != ""
      StrCpy $INSTDIR $0
    ${EndIf}
  ${EndIf}
FunctionEnd
Function un.onInit
  !insertmacro Initialize
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "--updated" $1
  ${IfNot} ${Errors}
    StrCpy $updating "1"
  ${EndIf}
FunctionEnd

# Extraction of this tiny read-only check is into NSIS' private temporary folder.
!macro RequireStopped prefix
Function ${prefix}RequireStopped
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=process-check.ps1 "${PROJECT_DIR}\build\installer-process-check.ps1"
  System::Call 'kernel32::SetEnvironmentVariableW(w "CAP7CE_INSTALL_APP", w "$INSTDIR\app")'
  check_process:
    nsExec::ExecToStack /TIMEOUT=15000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\process-check.ps1"'
    Pop $0
    Pop $1
    ${If} $0 != 0
      IfSilent stopped_abort
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(closeApplication)" IDRETRY check_process
      stopped_abort:
      SetErrorLevel 2
      Abort "$(closeApplication)"
    ${EndIf}
FunctionEnd
!macroend
!insertmacro RequireStopped ""
!insertmacro RequireStopped "un."

Function LaunchApplication
  ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\Cap7CE.lnk" "open" ""
FunctionEnd

Section "Cap7CE" MainSection
  SectionIn RO
  Call RequireStopped
  # Never recursively replace an unrecognised folder or a directory junction.
  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR")i.r0'
  IntOp $0 $0 & 0x400
  ${If} $0 != 0
    IfFileExists "$INSTDIR" unsafe_directory
  ${EndIf}
  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR\app")i.r0'
  ${If} $0 != -1
    IntOp $0 $0 & 0x400
    ${If} $0 != 0
      Goto unsafe_directory
    ${EndIf}
    IfFileExists "$INSTDIR\app\cap7ce-native.json" 0 unsafe_directory
    IfFileExists "$INSTDIR\app\Cap7CE.exe" 0 unsafe_directory
    RMDir /r "$INSTDIR\app"
    IfFileExists "$INSTDIR\app" unsafe_directory
  ${EndIf}
  SetOutPath "$INSTDIR\app"
  File /r "${STAGED_APP}\*.*"
  SetOutPath "$INSTDIR"
  CreateDirectory "$INSTDIR\models"
  CreateDirectory "$INSTDIR\llama.cpp"
  WriteUninstaller "$INSTDIR\Uninstall Cap7CE.exe"
  WriteRegStr HKLM "Software\d4b3d470-3007-5bc8-86ae-83016c5ca854" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayName" "Cap7CE"
  WriteRegStr HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINSTALL_REGISTRY_KEY}" "Publisher" "7C93F3-L"
  WriteRegStr HKLM "${UNINSTALL_REGISTRY_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$INSTDIR\app\Cap7CE.exe,0"
  WriteRegStr HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall Cap7CE.exe$\" /allusers'
  WriteRegStr HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall Cap7CE.exe$\" /allusers /S'
  WriteRegDWORD HKLM "${UNINSTALL_REGISTRY_KEY}" "EstimatedSize" ${ESTIMATED_SIZE}
  WriteRegDWORD HKLM "${UNINSTALL_REGISTRY_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL_REGISTRY_KEY}" "NoRepair" 1
  CreateShortCut "$INSTDIR\Cap7CE.lnk" "$INSTDIR\app\Cap7CE.exe" "" "$INSTDIR\app\Cap7CE.exe" 0
  WinShell::SetLnkAUMI "$INSTDIR\Cap7CE.lnk" "${APP_ID}"
  CreateShortCut "$DESKTOP\Cap7CE.lnk" "$INSTDIR\app\Cap7CE.exe" "" "$INSTDIR\app\Cap7CE.exe" 0
  WinShell::SetLnkAUMI "$DESKTOP\Cap7CE.lnk" "${APP_ID}"
  CreateShortCut "$SMPROGRAMS\Cap7CE.lnk" "$INSTDIR\app\Cap7CE.exe" "" "$INSTDIR\app\Cap7CE.exe" 0
  WinShell::SetLnkAUMI "$SMPROGRAMS\Cap7CE.lnk" "${APP_ID}"
  !insertmacro customInstall
  Goto install_done
  unsafe_directory:
    SetErrorLevel 1
    Abort "$(invalidInstallDirectory)"
  install_done:
SectionEnd

Section "un.Cap7CE"
  SectionIn RO
  Call un.RequireStopped
  SetOutPath "$TEMP"
  !insertmacro customRemoveFiles
  WinShell::UninstAppUserModelId "${APP_ID}"
  WinShell::UninstShortcut "$DESKTOP\Cap7CE.lnk"
  WinShell::UninstShortcut "$SMPROGRAMS\Cap7CE.lnk"
  Delete "$DESKTOP\Cap7CE.lnk"
  Delete "$SMPROGRAMS\Cap7CE.lnk"
  DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY}"
  DeleteRegKey HKLM "Software\d4b3d470-3007-5bc8-86ae-83016c5ca854"
  Delete "$INSTDIR\Uninstall Cap7CE.exe"
  RMDir "$INSTDIR"
SectionEnd
!insertmacro customUnInstallSection

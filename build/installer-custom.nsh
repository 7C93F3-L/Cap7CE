!include LogicLib.nsh

# Keep the package metadata for the executable version resources, but leave the
# installed shortcuts and Windows uninstall entry URL/comment fields blank.
!ifdef APP_DESCRIPTION
  !undef APP_DESCRIPTION
!endif
!define APP_DESCRIPTION ""
!ifdef UNINSTALL_URL_HELP
  !undef UNINSTALL_URL_HELP
!endif
!ifdef UNINSTALL_URL_INFO_ABOUT
  !undef UNINSTALL_URL_INFO_ABOUT
!endif
!ifdef UNINSTALL_URL_UPDATE_INFO
  !undef UNINSTALL_URL_UPDATE_INFO
!endif
!ifdef UNINSTALL_URL_README
  !undef UNINSTALL_URL_README
!endif

LangString cap7ceCleanupUserData 1033 "Remove shared user data (%APPDATA%\Cap7CE; affects all copies)"
LangString cap7ceCleanupUserData 2052 "删除共享用户数据（%APPDATA%\Cap7CE；影响所有副本）"
LangString cap7ceCleanupAiContent 1033 "Remove models and llama.cpp from this installation"
LangString cap7ceCleanupAiContent 2052 "删除此安装目录中的 models 和 llama.cpp"
LangString cap7ceUninstallUnsafePath 1033 "Cap7CE program files were not found in the uninstall directory. Nothing was removed."
LangString cap7ceUninstallUnsafePath 2052 "卸载目录中未找到 Cap7CE 程序文件，未删除任何内容。"
LangString cap7ceUninstallPreserveFailed 1033 "Cap7CE could not safely preserve models or llama.cpp. Nothing was removed."
LangString cap7ceUninstallPreserveFailed 2052 "Cap7CE 无法安全保留 models 或 llama.cpp，未删除任何内容。"

!ifdef BUILD_UNINSTALLER
  Var /GLOBAL cap7cePreserveRoot
  Var /GLOBAL cap7cePreservedModels
  Var /GLOBAL cap7cePreservedLlama

  # Keep NSIS' native recursive removal for real directories, but never recurse
  # when the selected root itself is a link or junction.
  Function un.cap7ceRemoveSelectedPath
    Exch $0
    Push $1
    Push $2
    Push $3

    System::Call 'kernel32::GetFileAttributesW(w r0)i.r1'
    StrCmp $1 -1 cap7ce_selected_done

    IntOp $2 $1 & 0x400
    IntOp $3 $1 & 0x10
    ${if} $2 != 0
      ${if} $3 != 0
        System::Call 'kernel32::RemoveDirectoryW(w r0)i.r1'
      ${else}
        Delete "$0"
      ${endif}
    ${elseif} $3 == 0
      Delete "$0"
    ${else}
      RMDir /r "$0"
    ${endif}

    cap7ce_selected_done:
      Pop $3
      Pop $2
      Pop $1
      Pop $0
  FunctionEnd

  Function un.cap7ceRestoreAiContent
    ${if} $cap7cePreservedModels == "1"
      Rename "$cap7cePreserveRoot\models" "$INSTDIR\models"
    ${endif}
    ${if} $cap7cePreservedLlama == "1"
      Rename "$cap7cePreserveRoot\llama.cpp" "$INSTDIR\llama.cpp"
    ${endif}
    RMDir "$cap7cePreserveRoot"
  FunctionEnd

  Function un.cap7ceRemoveApplicationFiles
    StrCpy $cap7cePreservedModels "0"
    StrCpy $cap7cePreservedLlama "0"

    ${ifNot} ${FileExists} "$INSTDIR\${PRODUCT_FILENAME}.exe"
      Abort "$(cap7ceUninstallUnsafePath)"
    ${endif}
    ${ifNot} ${FileExists} "$INSTDIR\resources\app.asar"
      Abort "$(cap7ceUninstallUnsafePath)"
    ${endif}

    System::Call 'kernel32::GetCurrentProcessId()i.r0'
    StrCpy $cap7cePreserveRoot "$INSTDIR.cap7ce-preserve-$0"
    System::Call 'kernel32::GetFileAttributesW(w "$cap7cePreserveRoot")i.r1'
    ${if} $1 != -1
      Abort "$(cap7ceUninstallPreserveFailed)"
    ${endif}
    CreateDirectory "$cap7cePreserveRoot"

    System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR\models")i.r1'
    ${if} $1 != -1
      ClearErrors
      Rename "$INSTDIR\models" "$cap7cePreserveRoot\models"
      ${if} ${Errors}
        RMDir "$cap7cePreserveRoot"
        Abort "$(cap7ceUninstallPreserveFailed)"
      ${endif}
      StrCpy $cap7cePreservedModels "1"
    ${endif}

    System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR\llama.cpp")i.r1'
    ${if} $1 != -1
      ClearErrors
      Rename "$INSTDIR\llama.cpp" "$cap7cePreserveRoot\llama.cpp"
      ${if} ${Errors}
        CreateDirectory "$INSTDIR"
        Call un.cap7ceRestoreAiContent
        Abort "$(cap7ceUninstallPreserveFailed)"
      ${endif}
      StrCpy $cap7cePreservedLlama "1"
    ${endif}

    SetOutPath $TEMP
    RMDir /r "$INSTDIR"

    CreateDirectory "$INSTDIR"
    Call un.cap7ceRestoreAiContent

    ${if} $cap7cePreservedModels != "1"
    ${andIf} $cap7cePreservedLlama != "1"
      RMDir "$INSTDIR"
    ${endif}

  FunctionEnd
!endif

!macro customUnInit
  # The standard uninstall section is index 0; the two sections appended by
  # customUnInstallSection are indexes 1 and 2. Use electron-builder's known
  # application size and only scan the two local AI directories. Recursively
  # sizing shared app data here could delay the uninstall UI for large caches.
  !ifdef ESTIMATED_SIZE
    SectionSetSize 0 ${ESTIMATED_SIZE}
  !else
    SectionSetSize 0 1
  !endif
  SectionSetSize 1 0

  StrCpy $4 0
  ${GetSize} "$INSTDIR\models" "/S=0K" $0 $1 $2
  StrCpy $4 $0
  ${GetSize} "$INSTDIR\llama.cpp" "/S=0K" $0 $1 $2
  IntOp $4 $4 + $0
  SectionSetSize 2 $4
!macroend

!macro customRemoveFiles
  Call un.cap7ceRemoveApplicationFiles
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}
  Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  RMDir "$LOCALAPPDATA\cap7ce-updater"
  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
!macroend

!macro customUnInstallSection
  Section /o "un.$(cap7ceCleanupUserData)" CAP7CE_CLEAN_USER_DATA_SECTION
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    Push "$APPDATA\Cap7CE"
    Call un.cap7ceRemoveSelectedPath
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  SectionEnd

  Section /o "un.$(cap7ceCleanupAiContent)" CAP7CE_CLEAN_AI_CONTENT_SECTION
    Push "$INSTDIR\models"
    Call un.cap7ceRemoveSelectedPath
    Push "$INSTDIR\llama.cpp"
    Call un.cap7ceRemoveSelectedPath
    RMDir "$INSTDIR"
  SectionEnd
!macroend

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

# electron-builder normally treats the directory page value as a parent and
# appends APP_FILENAME before the install page opens. Keep its default path and
# detected-install path, but treat a path explicitly chosen by the user as the
# final installation directory.
!macro customPageAfterChangeDir
  !ifdef MUI_PAGE_CUSTOMFUNCTION_PRE
    !undef MUI_PAGE_CUSTOMFUNCTION_PRE
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_PRE cap7ceInstallFilesPre

  Function cap7ceInstallFilesPre
    Goto cap7ce_install_files_pre_done
    # Keep electron-builder's generated function referenced so its strict NSIS
    # warning policy remains enabled, but never execute the path-appending code.
    Call instFilesPre
    cap7ce_install_files_pre_done:
  FunctionEnd
!macroend

LangString cap7ceCleanupUserData 1033 "Remove user data"
LangString cap7ceCleanupUserData 2052 "删除用户数据"
LangString cap7ceCleanupAiContent 1033 "Remove models and llama.cpp from this installation"
LangString cap7ceCleanupAiContent 2052 "删除本安装目录的 models 和 llama.cpp"
LangString cap7ceUninstallUnsafePath 1033 "Cap7CE program files were not found in the uninstall directory. Nothing was removed."
LangString cap7ceUninstallUnsafePath 2052 "卸载目录中未找到 Cap7CE 程序文件，未删除任何内容。"
LangString cap7ceUninstallPreserveFailed 1033 "Cap7CE could not safely preserve protected or user-managed content. Nothing was removed."
LangString cap7ceUninstallPreserveFailed 2052 "Cap7CE 无法安全保留受保护组件或用户内容，未删除任何内容。"
LangString cap7ceCapabilitySetupMissing 1033 "The Cap7CE full-disk search cleanup component is missing. Nothing was removed."
LangString cap7ceCapabilitySetupMissing 2052 "Cap7CE 全盘搜索清理组件缺失，未删除任何内容。"
LangString cap7ceCapabilityCleanupFailed 1033 "Cap7CE could not remove the full-disk search components. Nothing was removed."
LangString cap7ceCapabilityCleanupFailed 2052 "Cap7CE 无法移除全盘搜索组件，未删除任何内容。"

!ifdef BUILD_UNINSTALLER
  Var /GLOBAL cap7cePreserveRoot
  Var /GLOBAL cap7cePreservedModels
  Var /GLOBAL cap7cePreservedLlama
  Var /GLOBAL cap7cePreservedCore
  Var /GLOBAL cap7cePreservedReader

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

  Function un.cap7ceRestorePreservedContent
    ${if} $cap7cePreservedModels == "1"
      Rename "$cap7cePreserveRoot\models" "$INSTDIR\models"
    ${endif}
    ${if} $cap7cePreservedLlama == "1"
      Rename "$cap7cePreserveRoot\llama.cpp" "$INSTDIR\llama.cpp"
    ${endif}
    ${if} $cap7cePreservedCore == "1"
      Rename "$cap7cePreserveRoot\Core" "$INSTDIR\Core"
    ${endif}
    ${if} $cap7cePreservedReader == "1"
      Rename "$cap7cePreserveRoot\NtfsReader" "$INSTDIR\NtfsReader"
    ${endif}
    RMDir "$cap7cePreserveRoot"
  FunctionEnd

  Function un.cap7ceRemoveCoreCapability
    # The full-disk Catalog is rebuildable per-user data. Follow the existing
    # user-data choice instead of presenting a separate uninstall option.
    SectionGetFlags 1 $0
    IntOp $0 $0 & ${SF_SELECTED}
    StrCpy $1 "preserve"
    ${if} $0 != 0
      StrCpy $1 "remove"
    ${endif}

    # A user who never enabled the capability must not see an unnecessary UAC
    # prompt during uninstall. If no protected payload exists, only apply the
    # explicit per-user Catalog choice with the same reparse-safe helper.
    ${ifNot} ${FileExists} "$PROGRAMFILES64\Cap7CE\Core\v1\Cap7CE.Core.Host.exe"
    ${andIfNot} ${FileExists} "$PROGRAMFILES64\Cap7CE\NtfsReader\v1\Cap7CE.Core.Reader.Host.exe"
      ${if} $1 == "remove"
        Push "$LOCALAPPDATA\Cap7CE\Core"
        Call un.cap7ceRemoveSelectedPath
      ${endif}
      Return
    ${endif}

      StrCpy $2 "$INSTDIR\core\artifacts\product-capability\v1\bundle\Cap7CE.Core.Setup.exe"
    ${ifNot} ${FileExists} "$2"
      Abort "$(cap7ceCapabilitySetupMissing)"
    ${endif}
    nsExec::ExecToStack /TIMEOUT=360000 '"$2" --activation-coordinator --action remove --catalog $1'
    Pop $0
    Pop $1
    ${if} $0 != 0
      Abort "$(cap7ceCapabilityCleanupFailed)"
    ${endif}
  FunctionEnd

  Function un.cap7ceRemoveApplicationFiles
    StrCpy $cap7cePreservedModels "0"
    StrCpy $cap7cePreservedLlama "0"
    StrCpy $cap7cePreservedCore "0"
    StrCpy $cap7cePreservedReader "0"

    ${ifNot} ${FileExists} "$INSTDIR\${PRODUCT_FILENAME}.exe"
      Abort "$(cap7ceUninstallUnsafePath)"
    ${endif}
      ${ifNot} ${FileExists} "$INSTDIR\cap7ce-native.json"
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
        Call un.cap7ceRestorePreservedContent
        Abort "$(cap7ceUninstallPreserveFailed)"
      ${endif}
      StrCpy $cap7cePreservedLlama "1"
    ${endif}

    # The machine-wide app shares its product root with the separately managed
    # protected search capability. Updates must replace only app files.
    System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR\Core")i.r1'
    ${if} $1 != -1
      ClearErrors
      Rename "$INSTDIR\Core" "$cap7cePreserveRoot\Core"
      ${if} ${Errors}
        CreateDirectory "$INSTDIR"
        Call un.cap7ceRestorePreservedContent
        Abort "$(cap7ceUninstallPreserveFailed)"
      ${endif}
      StrCpy $cap7cePreservedCore "1"
    ${endif}

    System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR\NtfsReader")i.r1'
    ${if} $1 != -1
      ClearErrors
      Rename "$INSTDIR\NtfsReader" "$cap7cePreserveRoot\NtfsReader"
      ${if} ${Errors}
        CreateDirectory "$INSTDIR"
        Call un.cap7ceRestorePreservedContent
        Abort "$(cap7ceUninstallPreserveFailed)"
      ${endif}
      StrCpy $cap7cePreservedReader "1"
    ${endif}

    SetOutPath $TEMP
    RMDir /r "$INSTDIR"

    CreateDirectory "$INSTDIR"
    Call un.cap7ceRestorePreservedContent
      # Only bundled application runtimes; separately installed Core\v1 is retained.
      RMDir /r "$INSTDIR\Core\artifacts"

    ${if} $cap7cePreservedModels != "1"
    ${andIf} $cap7cePreservedLlama != "1"
    ${andIf} $cap7cePreservedCore != "1"
    ${andIf} $cap7cePreservedReader != "1"
      RMDir "$INSTDIR"
    ${endif}

  FunctionEnd
!endif

!macro customUnInit
  # The standard uninstall section is index 0; the user-data and installed AI
  # sections appended by customUnInstallSection are indexes 1 and 2. Use
  # electron-builder's known application size and only scan the two installed AI
  # directories. Recursively sizing shared app data here could delay the
  # uninstall UI for large caches, including a large full-disk Catalog.
  !ifdef ESTIMATED_SIZE
    SectionSetSize 0 ${ESTIMATED_SIZE}
  !else
    SectionSetSize 0 1
  !endif
  SectionSetSize 1 0

  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}
  StrCpy $4 0
  ${GetSize} "$INSTDIR\models" "/S=0K" $0 $1 $2
  StrCpy $4 $0
  ${GetSize} "$INSTDIR\llama.cpp" "/S=0K" $0 $1 $2
  IntOp $4 $4 + $0
  SectionSetSize 2 $4
  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
!macroend

!macro customRemoveFiles
  # App updates replace the machine-wide application only. Keep an already enabled
  # protected capability in place; a future version mismatch is surfaced by
  # the existing explicit Repair action instead of silently disabling search.
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}
  ${ifNot} ${isUpdated}
    Call un.cap7ceRemoveCoreCapability
  ${endif}
  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
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
    Push "$LOCALAPPDATA\Cap7CE\UserData"
    Call un.cap7ceRemoveSelectedPath
    Push "$LOCALAPPDATA\Cap7CE\updates"
    Call un.cap7ceRemoveSelectedPath
    # Also honor the explicit cleanup choice for data left by pre-migration builds.
    Push "$APPDATA\Cap7CE"
    Call un.cap7ceRemoveSelectedPath
    RMDir "$LOCALAPPDATA\Cap7CE"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  SectionEnd

  Section /o "un.$(cap7ceCleanupAiContent)" CAP7CE_CLEAN_AI_CONTENT_SECTION
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    Push "$INSTDIR\models"
    Call un.cap7ceRemoveSelectedPath
    Push "$INSTDIR\llama.cpp"
    Call un.cap7ceRemoveSelectedPath
    RMDir "$INSTDIR"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  SectionEnd
!macroend

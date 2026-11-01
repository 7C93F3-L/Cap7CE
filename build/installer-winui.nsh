!include "${PROJECT_DIR}\build\installer-custom.nsh"

# Keep APP_EXECUTABLE_FILENAME as a basename: NSIS also uses it for process checks.
# Retarget links after the standard install section has extracted the application.
!macro cap7ceInstallLayout
  StrCpy $appExe "$INSTDIR\app\${PRODUCT_FILENAME}.exe"
  SetOutPath "$INSTDIR\app"
  CreateShortCut "$INSTDIR\Cap7CE.lnk" "$appExe" "" "$appExe" 0
  WinShell::SetLnkAUMI "$INSTDIR\Cap7CE.lnk" "${APP_ID}"
  ${if} ${FileExists} "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${endif}
  ${if} ${FileExists} "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${endif}
  StrCpy $launchLink "$INSTDIR\Cap7CE.lnk"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$appExe,0"
  Delete "$INSTDIR\uninstallerIcon.ico"
  # The machine-wide NSIS target injects its helper outside the prepackaged app.
  CreateDirectory "$INSTDIR\app\resources"
  Rename "$INSTDIR\resources\elevate.exe" "$INSTDIR\app\resources\elevate.exe"
  RMDir "$INSTDIR\resources"
  CreateDirectory "$INSTDIR\models"
  CreateDirectory "$INSTDIR\llama.cpp"
  SetOutPath "$INSTDIR"
!macroend

; Extra NSIS for the electron-builder installer (package.json build.nsis.include).
; Replaces the stock finish page with one that keeps "Run" and adds a "Create a desktop shortcut"
; checkbox (MUI's spare README checkbox). Silent auto-updates skip the finish page, so they leave
; the shortcut as it is.

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function SovCreateDesktopShortcut
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_FILENAME}.exe" "" "$INSTDIR\${APP_FILENAME}.exe" 0
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_FINISHPAGE_SHOWREADME ""
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Create a desktop shortcut"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION SovCreateDesktopShortcut
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnInstall
  ; Only on a real uninstall, not the uninstall step an update runs before installing.
  ${ifNot} ${isUpdated}
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  ${endIf}
!macroend

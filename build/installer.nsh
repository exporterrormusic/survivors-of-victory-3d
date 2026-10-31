; Extra NSIS for the electron-builder installer (package.json build.nsis.include).
; Replaces the stock finish page with one that keeps "Run" and adds a "Create a desktop shortcut"
; checkbox (MUI's spare README checkbox). Auto-updates run this installer visibly so players see
; the progress bar, but skip every question and the finish page, then reopen the game.

!macro customInstallMode
  ; An update keeps the existing install's mode instead of asking "only for me / all users" again.
  ${if} ${isUpdated}
    ${if} $hasPerMachineInstallation == "1"
      StrCpy $isForceMachineInstall "1"
    ${else}
      StrCpy $isForceCurrentInstall "1"
    ${endif}
  ${endif}
!macroend

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

  ; An update goes straight back into the game instead of stopping on the finish page.
  Function SovFinishPre
    ${if} ${isUpdated}
      Call StartApp
      Abort
    ${endif}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_PRE SovFinishPre
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

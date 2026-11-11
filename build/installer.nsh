; Al desinstalar: cerrar Pal y quitar su conexión con Claude Code y el arranque con Windows.
; Al actualizar a una versión nueva (isUpdated) no se quita nada: la conexión sigue funcionando.
!macro customUnInstall
  nsExec::Exec 'taskkill /IM "Pixel Pal.exe" /F'
  Sleep 800
  ${ifNot} ${isUpdated}
    ExecWait '"$INSTDIR\Pixel Pal.exe" --cleanup'
  ${endIf}
!macroend

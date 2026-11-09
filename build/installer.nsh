; Al desinstalar: cerrar Clawd y quitar su conexión con Claude Code y el arranque con Windows.
; Al actualizar a una versión nueva (isUpdated) no se quita nada: la conexión sigue funcionando.
!macro customUnInstall
  nsExec::Exec 'taskkill /IM "Clawd Flotante.exe" /F'
  Sleep 800
  ${ifNot} ${isUpdated}
    ExecWait '"$INSTDIR\Clawd Flotante.exe" --cleanup'
  ${endIf}
!macroend

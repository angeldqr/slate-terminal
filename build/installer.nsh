; El host de sesiones de Slate es el propio slate.exe en modo Node: si sigue vivo de una versión
; anterior, bloquea los archivos y el instalador dice que Slate no se puede cerrar.
; Antes de instalar o desinstalar se detiene todo slate.exe (y lo que lanzó).
!macro customInit
  nsExec::Exec 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
!macroend

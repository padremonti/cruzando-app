@echo off
cd /d C:\rclone

echo ==========================================
echo SINCRONIZACION REAL A R2
echo ==========================================
echo.

echo [1/4] Generando manifiesto de cantos...
node "C:\Users\Usuario\Desktop\cruzando-app\tools\generate-cantos-manifest.js"
if errorlevel 1 (
  echo.
  echo *** ERROR generando el manifiesto. Se cancela el sync. ***
  echo *** Revisa que Node este instalado y la carpeta exista. ***
  pause
  exit /b 1
)
echo.

echo [2/4] cruzando-ilustraciones
.\rclone.exe sync "C:\R2\cruzando-ilustraciones" r2:cruzando-ilustraciones -P
echo.

echo [3/4] cruzando-music
.\rclone.exe sync "C:\R2\cruzando-music" r2:cruzando-music -P
echo.

echo [4/4] cruzando-audios
.\rclone.exe sync "C:\R2\cruzando-audios" r2:cruzando-audios -P
echo.

echo ==========================================
echo FIN DE LA SINCRONIZACION
echo ==========================================
pause

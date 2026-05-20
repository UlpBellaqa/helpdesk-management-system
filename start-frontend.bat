@echo off
cd /d "%~dp0frontend"
"C:\Program Files\nodejs\node.exe" ".\node_modules\next\dist\bin\next" dev -p 3000

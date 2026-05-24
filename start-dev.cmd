@echo off
cd /d "%~dp0"
node.exe node_modules\next\dist\bin\next dev -p 3001 > next-dev.log 2> next-dev.err.log

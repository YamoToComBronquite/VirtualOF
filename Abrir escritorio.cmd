@echo off
title Turno da Noite - escritorio virtual
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias na primeira vez...
  call npm install
)
call npm start -- --abrir
pause

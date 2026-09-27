@echo off
title Multi Twitch Viewer - install / update
rem Downloads and runs the latest installer script from GitHub.
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; & ([scriptblock]::Create((New-Object Net.WebClient).DownloadString('https://raw.githubusercontent.com/dominic-pasquarelli/multi-twitch-viewer/main/scripts/windows/install.ps1'))) %*"
if errorlevel 1 pause

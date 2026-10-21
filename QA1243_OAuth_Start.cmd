@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles%\GitHub CLI;%LOCALAPPDATA%\Programs\nodejs;%LOCALAPPDATA%\Programs\GitHub CLI"
echo QA1243 isolated QA Google OAuth setup - no credentials will be printed.
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Installing official Node.js LTS with Windows Package Manager...
  where winget.exe >nul 2>nul || goto NO_WINGET
  winget install --id OpenJS.NodeJS.LTS --exact --source winget --silent --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto INSTALL_FAILED
)
where gh.exe >nul 2>nul
if errorlevel 1 (
  echo Installing official GitHub CLI with Windows Package Manager...
  where winget.exe >nul 2>nul || goto NO_WINGET
  winget install --id GitHub.cli --exact --source winget --silent --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto INSTALL_FAILED
)
where node.exe >nul 2>nul || goto REOPEN
where gh.exe >nul 2>nul || goto REOPEN
node.exe "%~dp0scripts\qa1243_oauth_bootstrap.mjs" %*
if errorlevel 1 (
  echo QA1243 setup did not finish. Note the printed ERROR CODE only.
  pause
  exit /b 1
)
echo QA1243 secret transfer completed. Check trusted QA GitHub Actions.
pause
exit /b 0
:NO_WINGET
echo QA1243_WINGET_MISSING - install Node.js LTS and GitHub CLI from official sites.
pause
exit /b 1
:INSTALL_FAILED
echo QA1243_OFFICIAL_TOOL_INSTALL_FAILED - no Google token was requested.
pause
exit /b 1
:REOPEN
echo QA1243_TOOL_PATH_NOT_REFRESHED - close this window and double-click this file once more.
pause
exit /b 1

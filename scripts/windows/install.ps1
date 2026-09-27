<#
.SYNOPSIS
  Installs or updates Multi Twitch Viewer from the latest code on GitHub.

.DESCRIPTION
  Used by "Install Multi Twitch Viewer.cmd" and by the app's "Update now" button.
  It downloads the newest code, builds the Windows app on this PC and installs it.
  No GitHub Actions, Git, admin rights or Node.js install are needed: the script
  keeps its own private copy of Node.js in its working folder.

  Working folder: %LOCALAPPDATA%\MultiTwitchViewer-Builder (safe to delete).
  Written for Windows PowerShell 5.1 (built into Windows 10/11).
#>
[CmdletBinding()]
param(
  # Rebuild even if the installed app is already the latest version.
  [switch]$Force,
  # Don't start the app when done.
  [switch]$NoLaunch,
  # Called by the app itself: close the running app before installing.
  [switch]$FromApp,
  [string]$Repo = 'dominic-pasquarelli/multi-twitch-viewer',
  [string]$Branch = 'main',
  [string]$Root = '',
  # Load the functions only (for testing).
  [switch]$LibraryOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # the progress bar makes downloads ~10x slower in PS 5.1
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

$AppExeName = 'Multi Twitch Viewer.exe'
$AppProcessName = 'Multi Twitch Viewer'
$MinNodeMajor = 22

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-BuilderRoot([string]$Requested) {
  if ($Requested) { return $Requested }
  return (Join-Path $env:LOCALAPPDATA 'MultiTwitchViewer-Builder')
}

function Get-LatestCommit([string]$Repo, [string]$Branch) {
  $headers = @{ 'User-Agent' = 'multi-twitch-viewer-installer'; 'Accept' = 'application/vnd.github+json' }
  try {
    $commit = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/commits/$Branch" -Headers $headers
    return [pscustomobject]@{ Sha = [string]$commit.sha; Message = ([string]$commit.commit.message -split "`n")[0] }
  } catch {
    # API rate-limited or unavailable: ask the way git does (no API limit).
    $refs = Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/$Repo.git/info/refs?service=git-upload-pack" -Headers @{ 'User-Agent' = 'git/2.45 multi-twitch-viewer' }
    # Git's answer has a binary content type, so PowerShell returns bytes.
    $text = if ($refs.Content -is [byte[]]) { [Text.Encoding]::ASCII.GetString($refs.Content) } else { [string]$refs.Content }
    $m = [regex]::Match($text, "([0-9a-f]{40}) refs/heads/$Branch\b")
    if (-not $m.Success) { throw "Couldn't find the latest version on GitHub." }
    return [pscustomobject]@{ Sha = $m.Groups[1].Value; Message = '' }
  }
}

# Picks the newest Node.js LTS release (at least $MinNodeMajor) from nodejs.org's index.
function Select-NodeVersion($Releases, [int]$MinMajor) {
  foreach ($r in $Releases) {
    if ($r.lts -and $r.lts -ne $false) {
      $major = [int](($r.version -replace '^v', '') -split '\.')[0]
      if ($major -ge $MinMajor -and ($r.files -contains 'win-x64-zip')) { return [string]$r.version }
    }
  }
  throw "Couldn't find a Node.js LTS release (v$MinMajor or newer) for Windows."
}

function Install-PortableNode([string]$Root) {
  $nodeRoot = Join-Path $Root 'node'
  $version = Select-NodeVersion (Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json') $MinNodeMajor
  $dir = Join-Path $nodeRoot "node-$version-win-x64"
  if (-not (Test-Path (Join-Path $dir 'node.exe'))) {
    Write-Step "Downloading Node.js $version (private copy, used only for building)"
    New-Item -ItemType Directory -Force -Path $nodeRoot | Out-Null
    $zip = Join-Path $nodeRoot "node-$version.zip"
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$version/node-$version-win-x64.zip" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $nodeRoot -Force
    Remove-Item $zip -Force
    # Old versions are no longer needed.
    Get-ChildItem $nodeRoot -Directory | Where-Object { $_.FullName -ne $dir } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }
  return $dir
}

# Downloads the code for one commit into $Root\src, keeping node_modules from
# the previous build so updates only fetch what changed.
function Get-Source([string]$Root, [string]$Repo, [string]$Sha) {
  $src = Join-Path $Root 'src'
  $keep = Join-Path $Root 'node_modules.keep'
  $zip = Join-Path $Root 'source.zip'
  $unpack = Join-Path $Root 'source.tmp'

  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  Write-Step "Downloading the latest code ($($Sha.Substring(0, 7)))"
  Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/$Repo/zip/$Sha" -OutFile $zip
  if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $unpack -Force
  Remove-Item $zip -Force
  $folder = Get-ChildItem $unpack -Directory | Select-Object -First 1

  if (Test-Path (Join-Path $src 'node_modules')) {
    if (Test-Path $keep) { Remove-Item $keep -Recurse -Force }
    Move-Item (Join-Path $src 'node_modules') $keep
  }
  if (Test-Path $src) { Remove-Item $src -Recurse -Force }
  Move-Item $folder.FullName $src
  Remove-Item $unpack -Recurse -Force
  if (Test-Path $keep) { Move-Item $keep (Join-Path $src 'node_modules') }
  return $src
}

function Invoke-Checked([string]$What, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE). See the messages above." }
}

function Build-App([string]$Root, [string]$Src, [string]$NodeDir, [string]$Sha) {
  $env:Path = "$NodeDir;$env:Path"
  $env:npm_config_cache = Join-Path $Root 'npm-cache'
  $env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1' # electron-builder fetches its own copy
  Push-Location $Src
  try {
    Write-Step 'Installing build tools (first time takes a few minutes)'
    Invoke-Checked 'Installing build tools' { & npm.cmd install --no-audit --no-fund --loglevel=error }
    Write-Step 'Building the app'
    Invoke-Checked 'Building the app' { & npm.cmd run build }
    Write-Step 'Packaging the Windows installer'
    if (Test-Path 'release') { Remove-Item 'release' -Recurse -Force }
    Invoke-Checked 'Packaging' {
      & npx.cmd --no-install electron-builder --win --x64 --publish never "-c.extraMetadata.buildCommit=$Sha"
    }
    $setup = Get-ChildItem 'release' -Filter 'MultiTwitchViewer-Setup-*.exe' | Select-Object -First 1
    if (-not $setup) { throw 'The installer was not produced.' }
    return $setup.FullName
  } finally {
    Pop-Location
  }
}

function Find-InstalledApp {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\multi-twitch-viewer\$AppExeName"),
    (Join-Path $env:LOCALAPPDATA "Programs\Multi Twitch Viewer\$AppExeName")
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  # Otherwise ask Windows where the installer put it (its uninstall entry).
  $keys = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  foreach ($entry in (Get-ItemProperty $keys -ErrorAction SilentlyContinue)) {
    if ($entry.DisplayName -like 'Multi Twitch Viewer*' -and $entry.InstallLocation) {
      $exe = Join-Path $entry.InstallLocation $AppExeName
      if (Test-Path $exe) { return $exe }
    }
  }
  return $null
}

function Stop-App {
  $running = Get-Process -Name $AppProcessName -ErrorAction SilentlyContinue
  if ($running) {
    Write-Step 'Closing Multi Twitch Viewer'
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
  }
}

function Install-App([string]$Setup) {
  Stop-App
  Write-Step 'Installing'
  $p = Start-Process -FilePath $Setup -ArgumentList '/S' -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "The installer failed (exit code $($p.ExitCode))." }
}

function Start-App {
  $exe = Find-InstalledApp
  if ($exe) { Start-Process -FilePath $exe } else { Write-Warning "Installed, but couldn't find the app to start it. Use the desktop shortcut." }
}

function Invoke-InstallOrUpdate {
  $root = Get-BuilderRoot $Root
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  $stamp = Join-Path $root 'installed-commit.txt'

  Write-Step 'Checking GitHub for the latest version'
  $latest = Get-LatestCommit $Repo $Branch
  $installed = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() } else { '' }
  Write-Host "    Latest: $($latest.Sha.Substring(0, 7))  $($latest.Message)"

  if (-not $Force -and $installed -eq $latest.Sha -and (Find-InstalledApp)) {
    Write-Host '    You already have the latest version.' -ForegroundColor Green
    if (-not $NoLaunch) { Start-App }
    return
  }

  $node = Install-PortableNode $root
  $src = Get-Source $root $Repo $latest.Sha
  $setup = Build-App $root $src $node $latest.Sha
  Install-App $setup
  Set-Content -Path $stamp -Value $latest.Sha
  Write-Host ''
  Write-Host 'Multi Twitch Viewer is installed and up to date.' -ForegroundColor Green
  if (-not $NoLaunch) { Start-App }
}

if ($LibraryOnly) { return }

$root = Get-BuilderRoot $Root
New-Item -ItemType Directory -Force -Path $root | Out-Null
$log = Join-Path $root 'last-run.log'
try { Start-Transcript -Path $log -Force | Out-Null } catch { }
Write-Host 'Multi Twitch Viewer: install / update' -ForegroundColor Magenta
if ($FromApp) { Start-Sleep -Seconds 1 } # let the app finish closing
try {
  Invoke-InstallOrUpdate
  try { Stop-Transcript | Out-Null } catch { }
  Start-Sleep -Seconds 3
} catch {
  Write-Host ''
  Write-Host "Something went wrong: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "A log was saved to $log"
  try { Stop-Transcript | Out-Null } catch { }
  Read-Host 'Press Enter to close'
  exit 1
}

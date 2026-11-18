# Sets up the Waypoint helper for the current Windows user. No admin rights needed.
#  - copies waypoint-helper.ps1 to %LOCALAPPDATA%\Waypoint
#  - saves which mod manager, game and downloads folder to use
#  - registers waypoint:// links for this user (HKEY_CURRENT_USER\Software\Classes\waypoint)
# Run it again any time to change the settings. Remove everything with uninstall.ps1.
#
# Scripted use: install.ps1 -Manager MO2 -Game SE -Downloads "D:\MO2\downloads" [-NoRegister]

param(
  [ValidateSet('MO2', 'Vortex')] [string]$Manager,
  [ValidateSet('SE', 'VR', 'LE')] [string]$Game,
  [string]$Downloads,
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Waypoint'),
  [switch]$NoRegister
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$site = 'https://waypointmods.github.io/'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ''
Write-Host '  Waypoint helper setup' -ForegroundColor Yellow
Write-Host '  Lets "Download with MO2 / Vortex" buttons on Waypoint send mods straight to your mod manager.'
Write-Host ''

if (-not $Manager) {
  do { $m = Read-Host '  Which mod manager do you use?  1 = Mod Organizer 2,  2 = Vortex' } while ($m -notin '1', '2')
  $Manager = @{ '1' = 'MO2'; '2' = 'Vortex' }[$m]
}
if (-not $Game) {
  do { $g = Read-Host '  Which game?  1 = Skyrim Special Edition / Anniversary,  2 = Skyrim VR,  3 = Skyrim (original, LE)' } while ($g -notin '1', '2', '3')
  $Game = @{ '1' = 'SE'; '2' = 'VR'; '3' = 'LE' }[$g]
}
$gameName = @{ SE = 'SkyrimSE'; VR = 'SkyrimVR'; LE = 'Skyrim' }[$Game]   # MO2's names
$vortexId = @{ SE = 'skyrimse'; VR = 'skyrimvr'; LE = 'skyrim' }[$Game]   # Vortex's folder names

if (-not $Downloads) {
  # Suggest a folder: MO2 instances record theirs in ModOrganizer.ini; Vortex has a default.
  $suggest = $null
  if ($Manager -eq 'MO2') {
    $inis = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'ModOrganizer') -Filter 'ModOrganizer.ini' -Recurse -Depth 1 -ErrorAction SilentlyContinue
    foreach ($ini in $inis) {
      $line = Select-String -LiteralPath $ini.FullName -Pattern '^download_directory=(.+)$' | Select-Object -First 1
      $path = if ($line) { $line.Matches[0].Groups[1].Value.Trim('"') } else { Join-Path $ini.DirectoryName 'downloads' }
      if (-not $suggest -and (Test-Path -LiteralPath $path)) { $suggest = $path }
    }
    Write-Host '  Pick your MO2 downloads folder. For a portable MO2 it is the "downloads" folder next to ModOrganizer.exe,'
    Write-Host '  or check MO2: Settings > Paths > Downloads.'
  } else {
    $suggest = Join-Path $env:APPDATA "Vortex\downloads\$vortexId"
    Write-Host '  Pick your Vortex downloads folder for this game. Check Vortex: Settings > Downloads.'
  }
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Waypoint: choose your $Manager downloads folder"
  if ($suggest -and (Test-Path -LiteralPath $suggest)) { $dialog.SelectedPath = $suggest }
  if ($dialog.ShowDialog() -ne 'OK') { Write-Host '  Setup cancelled.'; exit 1 }
  $Downloads = $dialog.SelectedPath
}
if (-not (Test-Path -LiteralPath $Downloads -PathType Container)) { throw "Folder not found: $Downloads" }

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -LiteralPath (Join-Path $here 'waypoint-helper.ps1') -Destination $InstallDir -Force
Unblock-File -LiteralPath (Join-Path $InstallDir 'waypoint-helper.ps1') -ErrorAction SilentlyContinue
$config = [ordered]@{ site = $site; manager = $Manager; game = $Game; gameName = $gameName; downloads = $Downloads }
[IO.File]::WriteAllText((Join-Path $InstallDir 'config.json'), ($config | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))

if (-not $NoRegister) {
  $key = 'HKCU:\Software\Classes\waypoint'
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $helper = Join-Path $InstallDir 'waypoint-helper.ps1'
  New-Item -Path "$key\shell\open\command" -Force | Out-Null
  Set-Item -Path $key -Value 'URL:Waypoint mod download'
  Set-ItemProperty -Path $key -Name 'URL Protocol' -Value ''
  Set-Item -Path "$key\shell\open\command" -Value "`"$ps`" -NoProfile -ExecutionPolicy Bypass -File `"$helper`" `"%1`""
}

Write-Host ''
Write-Host "  Done. Waypoint downloads will go to: $Downloads" -ForegroundColor Green
Write-Host '  On a mod page, press "Download with MO2 / Vortex". Your browser asks once whether to open the link: allow it.'
Write-Host ''

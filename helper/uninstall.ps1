# Removes the Waypoint helper: the waypoint:// link registration and %LOCALAPPDATA%\Waypoint.
# Files it already downloaded stay in your mod manager's downloads folder.
$ErrorActionPreference = 'Stop'
Remove-Item -Path 'HKCU:\Software\Classes\waypoint' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'Waypoint') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ''
Write-Host '  The Waypoint helper has been removed.' -ForegroundColor Green
Write-Host ''

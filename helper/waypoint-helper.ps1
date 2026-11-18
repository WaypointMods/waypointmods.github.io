# Waypoint helper: opens waypoint:// links from the Waypoint website.
#
# It downloads the mod file from GitHub, checks it matches Waypoint's records (SHA-256), and puts it
# in your mod manager's downloads folder. The download address and fingerprint come from Waypoint's
# own mod list, not from the link, so a link can't point it at any other file.
#
#   waypoint://download?mod=<mod id>&file=<file name>

param(
  [string]$Link,
  [string]$ConfigDir = (Join-Path $env:LOCALAPPDATA 'Waypoint'),
  [switch]$NoDialogs   # for testing: print instead of showing message boxes
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Windows.Forms
try { $Host.UI.RawUI.WindowTitle = 'Waypoint' } catch { }

function Show-Message([string]$Text, [string]$Icon = 'Information', [string]$Buttons = 'OK') {
  if ($NoDialogs) { Write-Host "[$Icon] $Text"; return 'Yes' }
  return [string][System.Windows.Forms.MessageBox]::Show($Text, 'Waypoint', $Buttons, $Icon)
}

# MO2 reads .meta files with Qt's INI rules: quote text so commas and quotes survive.
function Quote([string]$s) { return '"' + $s.Replace('\', '\\').Replace('"', '\"') + '"' }

$tmp = $null
try {
  $config = Get-Content -LiteralPath (Join-Path $ConfigDir 'config.json') -Raw | ConvertFrom-Json

  if ($Link -notmatch '^waypoint://download/?\?(.+)$') { throw 'This is not a Waypoint download link.' }
  $query = @{}
  foreach ($pair in $Matches[1].Split('&')) {
    $kv = $pair.Split('=', 2)
    if ($kv.Count -eq 2) { $query[[Uri]::UnescapeDataString($kv[0])] = [Uri]::UnescapeDataString($kv[1].Replace('+', ' ')) }
  }
  $modId = $query['mod']
  $fileName = $query['file']
  if ($modId -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$') { throw 'The link has an invalid mod ID.' }
  if (-not $fileName -or $fileName -match '[\\/:*?"<>|]' -or $fileName -notmatch '\.(7z|zip|rar)$') { throw 'The link has an invalid file name.' }

  Write-Host 'Looking the mod up on Waypoint...'
  $mods = Invoke-RestMethod -Uri ($config.site + 'data/mods.json') -UseBasicParsing
  $mod = $mods | Where-Object { $_.id -eq $modId } | Select-Object -First 1
  if (-not $mod) { throw "Waypoint doesn't list a mod called '$modId' (any more)." }
  $file = $null
  $release = $null
  foreach ($r in $mod.releases) {
    foreach ($a in $r.assets) { if (-not $file -and $a.name -eq $fileName) { $file = $a; $release = $r } }
  }
  if (-not $file) { throw "'$fileName' isn't one of this mod's files on Waypoint." }
  if ($file.url -notmatch '^https://github\.com/[^/]+/[^/]+/releases/download/') { throw 'This file is not hosted on GitHub releases, so the helper will not download it.' }
  if ($file.sha256 -notmatch '^[0-9a-f]{64}$') { throw 'Waypoint has no fingerprint for this file yet. Try again in a few minutes.' }

  if ($file.scan -eq 'unscanned') {
    $answer = Show-Message ("$($mod.name) $($release.version) was NOT virus-scanned.`n`n" +
      "Only continue if you trust the author, and scan the file with your own antivirus before installing it.`n`nDownload anyway?") 'Warning' 'YesNo'
    if ($answer -ne 'Yes') { return }
  }

  $target = Join-Path $config.downloads $fileName
  if (Test-Path -LiteralPath $target) {
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLower() -eq $file.sha256) {
      Show-Message "$fileName is already in your downloads folder." | Out-Null
      return
    }
    $base = [IO.Path]::GetFileNameWithoutExtension($fileName)
    $ext = [IO.Path]::GetExtension($fileName)
    $n = 2
    while (Test-Path -LiteralPath $target) { $target = Join-Path $config.downloads "$base ($n)$ext"; $n++ }
  }

  # Download to the temp folder first, so the mod manager never sees a half-finished file.
  $tmp = Join-Path $env:TEMP ('waypoint-' + [guid]::NewGuid().ToString('N') + '.part')
  Write-Host ("Downloading $fileName ({0:N1} MB)..." -f ($file.size / 1MB))
  $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
  if (Test-Path -LiteralPath $curl) {
    & $curl -L --fail --progress-bar -o $tmp $file.url
    if ($LASTEXITCODE -ne 0) { throw "The download failed (curl exit code $LASTEXITCODE). Check your connection and try again." }
  } else {
    (New-Object Net.WebClient).DownloadFile($file.url, $tmp)
  }

  Write-Host "Checking the file matches Waypoint's records..."
  if ((Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash.ToLower() -ne $file.sha256) {
    throw ("The downloaded file doesn't match Waypoint's records, so it was deleted. " +
      'It may have been replaced since Waypoint checked it. Try again in a few minutes, or report the mod.')
  }
  Move-Item -LiteralPath $tmp -Destination $target
  $tmp = $null

  if ($config.manager -eq 'MO2') {
    $meta = @(
      '[General]',
      "gameName=$($config.gameName)",
      'modID=0',
      'fileID=0',
      "url=$(Quote $file.url)",
      "name=$(Quote $mod.name)",
      "modName=$(Quote $mod.name)",
      "version=$(Quote $release.version)",
      "description=$(Quote ('Downloaded from Waypoint: ' + $config.site + 'mod.html?id=' + $modId))",
      'repository=Waypoint',
      'installed=false',
      'uninstalled=false',
      'paused=false',
      'removed=false'
    )
    [IO.File]::WriteAllLines("$target.meta", $meta, (New-Object Text.UTF8Encoding $false))
    $next = "Open Mod Organizer's Downloads tab and double-click it to install."
  } else {
    $next = 'In Vortex, open Downloads (press Refresh if it is not listed yet) and install it.'
  }
  Show-Message "$($mod.name) $($release.version) downloaded and verified.`n`n$next" | Out-Null
} catch {
  Show-Message ("Waypoint couldn't download this file.`n`n" + $_.Exception.Message) 'Error' | Out-Null
  if ($NoDialogs) { exit 1 }
} finally {
  if ($tmp -and (Test-Path -LiteralPath $tmp)) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
}

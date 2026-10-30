param([string]$GodotPath = "", [switch]$PrepareTools, [string]$OutputPath = "")
$ErrorActionPreference = "Stop"
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($PrepareTools) { & python (Join-Path $PSScriptRoot 'download-godot-tools.py'); if ($LASTEXITCODE -ne 0) { throw 'Godot tools could not be prepared.' } }
if (-not $GodotPath) { $GodotPath = Join-Path $projectRoot '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe' }
if (-not (Test-Path -LiteralPath $GodotPath)) { throw 'Godot 4.5.1 is required. Run scripts/download-godot-tools.py or pass -GodotPath.' }
$toolDataPath = Join-Path $projectRoot '.runtime/godot'
New-Item -ItemType Directory -Force $toolDataPath | Out-Null
& python (Join-Path $PSScriptRoot 'sync-godot-export-resources.py')
if ($LASTEXITCODE -ne 0) { throw 'Godot runtime resource selection failed.' }
$sourcePath = Join-Path $projectRoot 'godot-arcana'
$outputPath = if ($OutputPath) { [IO.Path]::GetFullPath($OutputPath) } else { Join-Path $projectRoot 'godot-web' }
New-Item -ItemType Directory -Force $outputPath | Out-Null
$ErrorActionPreference = 'Continue' # Capture native stderr before inspecting the result.
$importOutput = @(& $GodotPath --headless --path $sourcePath --editor --import --quit 2>&1 | ForEach-Object { "$_" })
$importCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
$importOutput | Set-Content -Encoding utf8 (Join-Path $projectRoot '.runtime/godot/import.log')
if ($importCode -ne 0 -or ($importOutput -match 'SCRIPT ERROR|Parse Error|Failed to load script')) { $importOutput | Write-Output; throw 'Godot import failed.' }
$ErrorActionPreference = 'Continue'
$layoutOutput = @(& $GodotPath --headless --path $sourcePath --log-file (Join-Path $toolDataPath 'combat-layout-export.log') --script res://tools/export_combat_layout.gd 2>&1 | ForEach-Object { "$_" })
$layoutCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
$layoutErrors = $layoutOutput | Where-Object { $_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.$' }
if ($layoutCode -ne 0 -or $layoutErrors) { $layoutOutput | Write-Output; throw 'Combat layout export failed.' }
$ErrorActionPreference = 'Continue'
$exportOutput = @(& $GodotPath --headless --path $sourcePath --export-release Web (Join-Path $outputPath 'index.html') 2>&1 | ForEach-Object { "$_" })
$exportCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
$exportOutput | Set-Content -Encoding utf8 (Join-Path $projectRoot '.runtime/godot/export.log')
# Restricted Windows can deny the OS CA store. It is unrelated to offline export;
# retain it in the log and keep every other export error fatal.
$exportErrors = $exportOutput | Where-Object { $_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.$' }
if ($exportCode -ne 0 -or $exportErrors) { $exportOutput | Write-Output; throw 'Godot web export failed.' }
foreach ($name in @('index.html','index.js','index.wasm','index.pck')) { if (-not (Test-Path -LiteralPath (Join-Path $outputPath $name))) { throw "Missing export: $name" } }
# Resolve bytecode and scenes from the archive itself, not the editable source tree.
$verifyPath = Join-Path $toolDataPath 'web-pack-verify'
New-Item -ItemType Directory -Force $verifyPath | Out-Null
[IO.File]::WriteAllText((Join-Path $verifyPath 'project.godot'), 'config_version=5')
$ErrorActionPreference = 'Continue'
$packOutput = @(& $GodotPath --headless --path $verifyPath --log-file (Join-Path $toolDataPath 'web-pack-check.log') --script (Join-Path $sourcePath 'tools/verify_web_pack.gd') -- (Join-Path $outputPath 'index.pck') 2>&1 | ForEach-Object { "$_" })
$packCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($packCode -ne 0 -or -not ($packOutput -match '^ARCANA_WEB_PACK_VERIFIED$')) { $packOutput | Write-Output; throw 'Exported Godot runtime is incomplete.' }
Write-Output 'Godot Web export ready: /godot/'

param([switch]$Publish, [string]$ExistingBuild = "", [string]$GodotPath = "", [string]$WebOutputPath = "")
$ErrorActionPreference = 'Stop'
$rootPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$buildPath = if ($ExistingBuild) { [IO.Path]::GetFullPath($ExistingBuild) } else { Join-Path $rootPath ('.runtime/godot/online-build-' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)) }
if (-not $buildPath.StartsWith((Join-Path $rootPath '.runtime/godot/online-build-'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Build path must be an isolated online-build directory' }
New-Item -ItemType Directory -Force $buildPath | Out-Null
$stageListPath = Join-Path $buildPath 'stage-inputs.json'
& python (Join-Path $rootPath 'scripts/sync-godot-export-resources.py') --stage-list $stageListPath
if ($LASTEXITCODE -ne 0) { throw 'Runtime resource selection failed' }
$stagePath = Join-Path $buildPath 'project'
$outputPath = Join-Path $buildPath 'web'
New-Item -ItemType Directory -Force $stagePath,$outputPath | Out-Null
$stageInputs = Get-Content -LiteralPath $stageListPath -Raw | ConvertFrom-Json
foreach ($relative in $stageInputs) {
  $sourceFile = Join-Path (Join-Path $rootPath 'godot-arcana') $relative
  $targetFile = Join-Path $stagePath $relative
  New-Item -ItemType Directory -Force (Split-Path $targetFile -Parent) | Out-Null
  Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
}
Write-Output ('Staged '+$stageInputs.Count+' runtime/build inputs; authoring history excluded.')
$projectPath = Join-Path $stagePath 'project.godot'
$projectText = [IO.File]::ReadAllText($projectPath)
$projectText = [regex]::Replace($projectText,'(?ms)\[editor_plugins\]\s*.*?(?=\[filesystem\])','')
# The source editor can use MCP; the addon-free game stage must not autoload its helper.
$projectText = [regex]::Replace($projectText,'(?m)^_mcp_game_helper="\*res://addons/godot_ai/runtime/game_helper\.gd"\r?\n','')
[IO.File]::WriteAllText($projectPath,$projectText)
$presetPath = Join-Path $stagePath 'export_presets.cfg'
$presetText = [IO.File]::ReadAllText($presetPath).Replace('../.runtime/godot/web_nothreads_release.zip',(Join-Path $rootPath '.runtime/godot/web_nothreads_release.zip').Replace('\','/'))
[IO.File]::WriteAllText($presetPath,$presetText)
$enginePath = if ($GodotPath) { [IO.Path]::GetFullPath($GodotPath) } else { Join-Path $rootPath '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe' }
if (-not (Test-Path -LiteralPath $enginePath -PathType Leaf)) { throw 'The pinned Godot 4.5.1 build engine is missing. Use build-godot-arcana.ps1 -PrepareTools.' }
$engineVersion = (& $enginePath --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $engineVersion.StartsWith('4.5.1.stable.',[StringComparison]::Ordinal)) { throw ('Web templates are pinned to Godot 4.5.1; refusing mismatched build engine: '+$engineVersion) }
foreach ($phase in @('import','combat','layout','export')) {
  $engineArgs = @('--headless','--path',$stagePath,'--log-file',(Join-Path $buildPath ($phase+'.engine.log')))
  if ($phase -eq 'import') { $engineArgs += @('--editor','--import','--quit') }
  elseif ($phase -eq 'combat') { $engineArgs += @('--script','res://tools/export_combat_layout.gd') }
  elseif ($phase -eq 'layout') { $engineArgs += @('--script','res://tools/export_online_layout.gd') }
  else { $engineArgs += @('--export-release','Web',(Join-Path $outputPath 'index.html')) }
  $ErrorActionPreference = 'Continue'
  $engineOutput = @(& $enginePath @engineArgs 2>&1 | ForEach-Object { "$_" })
  $engineCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $engineOutput | Set-Content -Encoding utf8 (Join-Path $buildPath ($phase+'.log'))
  $engineErrors = $engineOutput | Where-Object { $_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.' }
  if ($engineCode -ne 0 -or $engineErrors) {
    $engineErrors | Select-Object -First 14 | Write-Output
    throw ("Godot "+$phase+" failed; logs: "+$buildPath)
  }
}
Copy-Item -LiteralPath (Join-Path $stagePath 'art/export/combat-layout.json') -Destination (Join-Path $rootPath 'godot-arcana/art/export/combat-layout.json')
Copy-Item -LiteralPath (Join-Path $stagePath 'art/export/online-layout.json') -Destination (Join-Path $rootPath 'godot-arcana/art/export/online-layout.json')
# Resolve runtime scripts from the archive, without a source-tree fallback.
$verifyPath = Join-Path $buildPath 'pack-verify'
New-Item -ItemType Directory -Force $verifyPath | Out-Null
[IO.File]::WriteAllText((Join-Path $verifyPath 'project.godot'), 'config_version=5')
$ErrorActionPreference = 'Continue'
$verifyOutput = @(& $enginePath --headless --path $verifyPath --log-file (Join-Path $buildPath 'pack-verify.engine.log') --script (Join-Path $rootPath 'godot-arcana/tools/verify_web_pack.gd') -- (Join-Path $outputPath 'index.pck') 2>&1 | ForEach-Object { "$_" })
$verifyCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
$verifyOutput | Set-Content -Encoding utf8 (Join-Path $buildPath 'pack-verify.log')
if ($verifyCode -ne 0 -or -not ($verifyOutput -match '^ARCANA_WEB_PACK_VERIFIED$')) { $verifyOutput | Write-Output; throw 'Exported runtime resources are incomplete' }
if ($Publish -or $WebOutputPath) {
  $deliveryPath = if ($WebOutputPath) { [IO.Path]::GetFullPath($WebOutputPath) } else { Join-Path $rootPath 'godot-web' }
  if (-not $deliveryPath.StartsWith($rootPath + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Web output must stay inside the project workspace' }
  New-Item -ItemType Directory -Force $deliveryPath | Out-Null
  foreach ($entry in Get-ChildItem -LiteralPath $outputPath -File) {
    $targetPath = Join-Path $deliveryPath $entry.Name
    if ((Test-Path -LiteralPath $targetPath) -and (Get-FileHash -LiteralPath $targetPath).Hash -eq (Get-FileHash -LiteralPath $entry.FullName).Hash) { continue }
    $tempPath = $targetPath + '.online.tmp'
    Copy-Item -LiteralPath $entry.FullName -Destination $tempPath
    if (Test-Path -LiteralPath $targetPath) {
      $backupPath = Join-Path $buildPath ('previous-' + $entry.Name)
      [IO.File]::Replace($tempPath,$targetPath,$backupPath)
    }
    else { [IO.File]::Move($tempPath,$targetPath) }
  }
  if ($deliveryPath.Equals((Join-Path $rootPath 'godot-web'),[StringComparison]::OrdinalIgnoreCase)) {
    # Fastify serves precompressed files too; raw PCK alone leaves the old game live.
    Push-Location $rootPath
    try {
      & node (Join-Path $rootPath 'scripts/build-godot-delivery.mjs')
      if ($LASTEXITCODE -ne 0) { throw 'Godot raw/compressed delivery snapshot failed' }
    }
    finally { Pop-Location }
  }
}
Write-Output ('Online world web build: '+$outputPath)

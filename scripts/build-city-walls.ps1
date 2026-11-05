param([string]$StagePath='')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stage=if($StagePath){$StagePath}else{Join-Path $root '.runtime/godot/city-wall-art-release'}
New-Item -ItemType Directory -Force $stage|Out-Null
& robocopy (Join-Path $root 'godot-arcana') $stage /E /XD addons .godot (Join-Path $root 'godot-arcana/art/reference') /NFL /NDL /NJH /NJS /NP|Out-Null
if($LASTEXITCODE -gt 7){throw 'City wall runtime copy failed'}
$p=Join-Path $stage 'project.godot'
$s=[IO.File]::ReadAllText($p)
$s=[regex]::Replace($s,'(?ms)\[editor_plugins\]\s*.*?(?=\[filesystem\])','')
[IO.File]::WriteAllText($p,$s)
$p=Join-Path $stage 'export_presets.cfg'
$s=[IO.File]::ReadAllText($p).Replace('../.runtime/godot/web_nothreads_release.zip',(Join-Path $root '.runtime/godot/web_nothreads_release.zip').Replace('\','/'))
[IO.File]::WriteAllText($p,$s)
$env:APPDATA=Join-Path $root '.runtime/godot/appdata'
$env:LOCALAPPDATA=Join-Path $root '.runtime/godot/localappdata'
$godot=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
function Run-GodotStep([string]$name,[string[]]$arguments){
 $ErrorActionPreference='Continue'
 $output=@(& $godot --headless --path $stage --log-file (Join-Path $root ('.runtime/godot/city-wall-'+$name+'-engine.log')) @arguments 2>&1|ForEach-Object{"$_"});$result=$LASTEXITCODE
 $ErrorActionPreference='Stop'
 $output|Set-Content -Encoding utf8 (Join-Path $root ('.runtime/godot/city-wall-'+$name+'.log'))
 $errors=$output|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
 if($result -ne 0 -or $errors){$errors|Select-Object -First 8|Write-Output;throw "City wall $name failed"}
 Write-Output "City wall $name complete"
}
Run-GodotStep 'import' @('--editor','--import','--quit')
Run-GodotStep 'tileset' @('--script','res://tools/build_wall_tileset.gd')
Run-GodotStep 'phases' @('--script','res://tools/update_wall_art_phases.gd')
Run-GodotStep 'collision' @('--script','res://tools/export_combat_layout.gd')
foreach($relative in @('art/resources/wall_tileset.tres','scenes/walls/city_walls.tscn','art/export/combat-layout.json')){
 Copy-Item -LiteralPath (Join-Path $stage $relative) -Destination (Join-Path $root ('godot-arcana/'+$relative))
}
Run-GodotStep 'export' @('--export-release','Web',(Join-Path $root 'godot-web/index.html'))
Write-Output "City wall art and Web export complete: $stage"

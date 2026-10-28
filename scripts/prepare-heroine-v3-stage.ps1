param([switch]$Export)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskStage=Join-Path $taskRoot '.runtime/godot/blender-heroine-v3-stage'
New-Item -ItemType Directory -Force $taskStage|Out-Null
& robocopy (Join-Path $taskRoot 'godot-arcana') $taskStage /E /XD addons .godot /NFL /NDL /NJH /NJS /NP|Out-Null
if($LASTEXITCODE -gt 7){throw 'Stage copy failed'}
# Evidence screenshots are not runtime inputs; one unrelated in-progress PNG is incomplete.
[IO.File]::WriteAllText((Join-Path $taskStage 'art/reference/.gdignore'),'')
$project=Join-Path $taskStage 'project.godot';$text=[IO.File]::ReadAllText($project);$text=[regex]::Replace($text,'(?ms)\[editor_plugins\]\s*.*?(?=\[filesystem\])','');[IO.File]::WriteAllText($project,$text)
$worldFile=Join-Path $taskStage 'scripts/pixel3d_world.gd';$text=[IO.File]::ReadAllText($worldFile).Replace('res://scripts/heroine_sprite.gd','res://scripts/heroine_blender.gd');[IO.File]::WriteAllText($worldFile,$text)
$preset=Join-Path $taskStage 'export_presets.cfg';$text=[IO.File]::ReadAllText($preset).Replace('../.runtime/godot/web_nothreads_release.zip',(Join-Path $taskRoot '.runtime/godot/web_nothreads_release.zip').Replace('\','/'));[IO.File]::WriteAllText($preset,$text)
$exe=Join-Path $taskRoot '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
$logs=Join-Path $taskRoot '.runtime/godot'
$output=@(& $exe --headless --path $taskStage --log-file (Join-Path $logs 'heroine-v3-import-engine.log') --editor --import --quit 2>&1|ForEach-Object{"$_"})
[IO.File]::WriteAllLines((Join-Path $logs 'heroine-v3-import.log'),$output)
$errors=$output|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
if($LASTEXITCODE -ne 0 -or $errors){$errors|Select-Object -First 10|Write-Output;throw 'V3 import failed'}
if($Export){
 $target=Join-Path $taskRoot 'art-studies/arcana-hero/white-bob-heroine/blender-v3/web';New-Item -ItemType Directory -Force $target|Out-Null
 $output=@(& $exe --headless --path $taskStage --log-file (Join-Path $logs 'heroine-v3-export-engine.log') --export-release Web (Join-Path $target 'index.html') 2>&1|ForEach-Object{"$_"})
 [IO.File]::WriteAllLines((Join-Path $logs 'heroine-v3-export.log'),$output)
 $errors=$output|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
 if($LASTEXITCODE -ne 0 -or $errors){$errors|Select-Object -First 10|Write-Output;throw 'V3 export failed'}
}
Write-Output 'Blender V3 runtime stage ready.'

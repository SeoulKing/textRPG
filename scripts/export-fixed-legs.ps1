param([string]$StagePath="")
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stage=if($StagePath){$StagePath}else{Join-Path $root ('.runtime/godot/fixed-legs-stage-'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss'))}
New-Item -ItemType Directory -Force $stage|Out-Null
& robocopy (Join-Path $root 'godot-arcana') $stage /E /XD addons .godot /NFL /NDL /NJH /NJS /NP | Out-Null
if($LASTEXITCODE -gt 7){throw 'Runtime copy failed'}
$project=Join-Path $stage 'project.godot'
$text=[IO.File]::ReadAllText($project)
$text=[regex]::Replace($text,'(?ms)\[editor_plugins\]\s*.*?(?=\[filesystem\])','')
[IO.File]::WriteAllText($project,$text)
$preset=Join-Path $stage 'export_presets.cfg'
$text=[IO.File]::ReadAllText($preset).Replace('../.runtime/godot/web_nothreads_release.zip',(Join-Path $root '.runtime/godot/web_nothreads_release.zip').Replace('\','/'))
[IO.File]::WriteAllText($preset,$text)
[IO.File]::WriteAllText((Join-Path $root '.runtime/godot/fixed-legs-stage-path.txt'),$stage)
$godot=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
foreach($step in @('import','export')){
 $args=@('--headless','--path',$stage)
 if($step -eq 'import'){$args+=@('--editor','--import','--quit')}else{$args+=@('--export-release','Web',(Join-Path $root 'godot-web/index.html'))}
 $ErrorActionPreference='Continue'
 $output=@(& $godot @args 2>&1|ForEach-Object{"$_"});$code=$LASTEXITCODE
 $ErrorActionPreference='Stop'
 $output|Set-Content -Encoding utf8 (Join-Path $root ('.runtime/godot/fixed-legs-'+$step+'.log'))
 $errors=$output|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
 if($code -ne 0 -or $errors){$errors|Select-Object -First 8|Write-Output;throw "Runtime $step failed"}
}
Write-Output 'Fixed-leg Web export complete; original editor plugins preserved.'

param([string]$StagePath='', [string]$OutputPath='')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $StagePath){$StagePath=Join-Path $root '.runtime/godot/fountain-paving-stage'}
if(-not $OutputPath){$OutputPath=Join-Path $root '.runtime/godot/fountain-paving-web'}
New-Item -ItemType Directory -Force $StagePath,$OutputPath | Out-Null
& robocopy (Join-Path $root 'godot-arcana') $StagePath /E /XD addons .godot /NFL /NDL /NJH /NJS /NP | Out-Null
if($LASTEXITCODE -gt 7){throw 'Fountain paving runtime copy failed'}
$p=Join-Path $StagePath 'project.godot'
$t=[regex]::Replace([IO.File]::ReadAllText($p),'(?ms)\[editor_plugins\]\s*.*?(?=\[filesystem\])','')
[IO.File]::WriteAllText($p,$t)
$p=Join-Path $StagePath 'export_presets.cfg'
$t=[IO.File]::ReadAllText($p).Replace('../.runtime/godot/web_nothreads_release.zip',(Join-Path $root '.runtime/godot/web_nothreads_release.zip').Replace('\','/'))
[IO.File]::WriteAllText($p,$t)
$env:APPDATA=Join-Path $root '.runtime/godot/appdata'
$env:LOCALAPPDATA=Join-Path $root '.runtime/godot/localappdata'
$godot=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
foreach($step in @('import','export')){
 $params=@('--headless','--path',$StagePath,'--log-file',(Join-Path $root ('.runtime/godot/fountain-paving-'+$step+'-engine.log')))
 if($step -eq 'import'){$params+=@('--editor','--import','--quit')}else{$params+=@('--export-release','Web',(Join-Path $OutputPath 'index.html'))}
 $ErrorActionPreference='Continue'
 $output=@(& $godot @params 2>&1 | ForEach-Object{"$_"});$code=$LASTEXITCODE
 $ErrorActionPreference='Stop'
 $output | Set-Content -Encoding utf8 (Join-Path $root ('.runtime/godot/fountain-paving-'+$step+'.log'))
 $errors=$output | Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
 if($code -ne 0 -or $errors){$errors | Select-Object -First 8 | Write-Output;throw "Fountain paving $step failed"}
}
Write-Output "Fountain paving export ready for package inspection: $OutputPath"

param([switch]$RenderOnly)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stage=Join-Path $root '.runtime/godot/academy-interior-stage'
$outputDir=Join-Path $root '.runtime/godot/academy-interior-web'
$godot=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
if (-not $RenderOnly) {
 New-Item -ItemType Directory -Force $stage,$outputDir | Out-Null
 & robocopy (Join-Path $root 'godot-arcana') $stage /E /XD addons .godot /NFL /NDL /NJH /NJS /NP | Out-Null
 if($LASTEXITCODE -gt 7){throw 'Runtime copy failed'}
 $project=Join-Path $stage 'project.godot'
 $text=[IO.File]::ReadAllText($project)
 $text=[regex]::Replace($text,'(?ms)\[editor_plugins\]\s*.*?(?=\[filesystem\])','')
 [IO.File]::WriteAllText($project,$text)
 $preset=Join-Path $stage 'export_presets.cfg'
 $text=[IO.File]::ReadAllText($preset).Replace('../.runtime/godot/web_nothreads_release.zip',(Join-Path $root '.runtime/godot/web_nothreads_release.zip').Replace('\','/'))
 [IO.File]::WriteAllText($preset,$text)
 foreach($step in @('import','export')) {
  $arguments=@('--headless','--path',$stage,'--log-file',(Join-Path $root ('.runtime/godot/academy-'+$step+'-engine.log')))
  if($step -eq 'import'){$arguments+=@('--editor','--import','--quit')}else{$arguments+=@('--export-release','Web',(Join-Path $outputDir 'index.html'))}
  $ErrorActionPreference='Continue'
  $output=@(& $godot @arguments 2>&1 | ForEach-Object{"$_"}); $code=$LASTEXITCODE
  $ErrorActionPreference='Stop'
  $output | Set-Content -Encoding utf8 (Join-Path $root ('.runtime/godot/academy-'+$step+'.log'))
  $errors=$output | Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
  if($code -ne 0 -or $errors){$errors | Select-Object -First 10 | Write-Output;throw "Academy $step failed"}
 }
 Write-Output "Academy Web build: $outputDir"
}
# Use the same isolated runtime project for offline captures and Web export.
Copy-Item -LiteralPath (Join-Path $root 'godot-arcana/tools/render_academy_interior.gd') -Destination (Join-Path $stage 'tools/render_academy_interior.gd')
$appdata=Join-Path $root '.runtime/godot/academy-appdata'
$localdata=Join-Path $root '.runtime/godot/academy-localappdata'
New-Item -ItemType Directory -Force $appdata,$localdata | Out-Null
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$godot
$start.WorkingDirectory=$root
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput=$true
$start.RedirectStandardError=$true
$start.EnvironmentVariables['APPDATA']=$appdata
$start.EnvironmentVariables['LOCALAPPDATA']=$localdata
foreach($arg in @('--path',$stage,'--log-file',(Join-Path $root '.runtime/godot/academy-render-engine.log'),'--rendering-method','gl_compatibility','--script','res://tools/render_academy_interior.gd')){$start.ArgumentList.Add($arg)}
$process=[Diagnostics.Process]::Start($start)
$stdout=$process.StandardOutput.ReadToEndAsync()
$stderr=$process.StandardError.ReadToEndAsync()
if(-not $process.WaitForExit(60000)){$process.Kill();throw 'Academy offline capture exceeded 60 seconds'}
$log=$stdout.Result+$stderr.Result
[IO.File]::WriteAllText((Join-Path $root '.runtime/godot/academy-render.log'),$log)
$errors=$log -split "`n" | Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
if($process.ExitCode -ne 0 -or $errors){$errors|Select-Object -First 10|Write-Output;throw 'Academy art capture failed'}
$art=Join-Path $root 'godot-arcana/art/reference/academy-interior'
New-Item -ItemType Directory -Force $art | Out-Null
Copy-Item -Path (Join-Path $stage 'art/reference/academy-interior/*.png') -Destination $art
Write-Output "Academy offline art: $art"

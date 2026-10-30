param([switch]$Publish,[string]$ArtDirectory='heroine-continuity-v3')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stage=Join-Path $root ('.runtime/godot/continuity-v3-'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss'))
$web=Join-Path $stage 'web'
$public=Join-Path $root 'godot-web'
$oldHash=(Get-FileHash -LiteralPath (Join-Path $public 'index.pck')).Hash
$hero=Join-Path $root 'godot-arcana/scripts/heroine_run.gd'
$heroHash=(Get-FileHash -LiteralPath $hero).Hash
$godot=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
$warm=Get-ChildItem -LiteralPath (Join-Path $root '.runtime/godot') -Directory -Filter 'continuity-v3-*' | Sort-Object Name | Select-Object -Last 1
New-Item -ItemType Directory -Force $stage,$web | Out-Null
if($warm){
 & robocopy $warm.FullName $stage /E /XD web appdata localappdata /XF *.log /NFL /NDL /NJH /NJS /NP | Out-Null
 if($LASTEXITCODE -gt 7){throw 'Existing import cache copy failed'}
}
& robocopy (Join-Path $root 'godot-arcana') $stage /E /XD addons .godot /NFL /NDL /NJH /NJS /NP | Out-Null
if($LASTEXITCODE -gt 7){throw 'Runtime copy failed'}
$project=Join-Path $stage 'project.godot'
$text=[IO.File]::ReadAllText($project)
$text=[regex]::Replace($text,'(?ms)\[editor_plugins\]\s*.*?(?=\[filesystem\])','')
[IO.File]::WriteAllText($project,$text)
$preset=Join-Path $stage 'export_presets.cfg'
$text=[IO.File]::ReadAllText($preset).Replace('../.runtime/godot/web_nothreads_release.zip',(Join-Path $root '.runtime/godot/web_nothreads_release.zip').Replace('\','/'))
[IO.File]::WriteAllText($preset,$text)
$renderScript=Join-Path $stage 'tools/render_heroine_continuity.gd'
$renderText=[IO.File]::ReadAllText($renderScript).Replace('heroine-continuity-v3/',$ArtDirectory+'/')
[IO.File]::WriteAllText($renderScript,$renderText)
foreach($step in @('import','export')){
 $arguments=@('--headless','--path',$stage,'--log-file',(Join-Path $stage ($step+'-engine.log')))
 if($step -eq 'import'){$arguments+=@('--editor','--import','--quit')}else{$arguments+=@('--export-release','Web',(Join-Path $web 'index.html'))}
 $ErrorActionPreference='Continue'
 $output=@(& $godot @arguments 2>&1|ForEach-Object{"$_"});$code=$LASTEXITCODE
 $ErrorActionPreference='Stop'
 $output|Set-Content -Encoding utf8 (Join-Path $stage ($step+'.log'))
 $errors=$output|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
 if($code -ne 0 -or $errors){$errors|Select-Object -First 8|Write-Output;throw "Continuity $step failed"}
}
Write-Output "Web build ready: $web"
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$godot
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$start.EnvironmentVariables['APPDATA']=Join-Path $stage 'appdata'
$start.EnvironmentVariables['LOCALAPPDATA']=Join-Path $stage 'localappdata'
foreach($arg in @('--path',$stage,'--log-file',(Join-Path $stage 'render-engine.log'),'--rendering-method','gl_compatibility','--script','res://tools/render_heroine_continuity.gd')){$start.ArgumentList.Add($arg)}
$process=[Diagnostics.Process]::Start($start)
$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
if(-not $process.WaitForExit(55000)){$process.Kill();throw 'Continuity art render exceeded55seconds'}
$log=$stdout.Result+$stderr.Result
[IO.File]::WriteAllText((Join-Path $stage 'render.log'),$log)
$errors=$log -split "`n"|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
if($process.ExitCode -ne 0 -or $errors){$errors|Select-Object -First 8|Write-Output;throw 'Continuity art render failed'}
$dest=Join-Path $root ('godot-arcana/art/reference/'+$ArtDirectory)
New-Item -ItemType Directory -Force $dest|Out-Null
Copy-Item -Path (Join-Path $stage ('art/reference/'+$ArtDirectory+'/*.png')) -Destination $dest
if($Publish){
 if((Get-FileHash -LiteralPath $hero).Hash -ne $heroHash){throw 'Character source changed during build; preserve concurrent edits and rebuild.'}
 if((Get-FileHash -LiteralPath (Join-Path $public 'index.pck')).Hash -ne $oldHash){throw 'Another Web build was published during this build; isolated output preserved.'}
 foreach($name in @('index.html','index.js','index.wasm','index.pck','index.audio.worklet.js','index.audio.position.worklet.js')){
  $source=Join-Path $web $name
  if(-not(Test-Path -LiteralPath $source)){continue}
  $target=Join-Path $public $name
  $temporary=Join-Path $public ($name+'.continuity-new')
  Copy-Item -LiteralPath $source -Destination $temporary
  if(Test-Path -LiteralPath $target){[IO.File]::Replace($temporary,$target,(Join-Path $web ('previous-'+$name)))}else{Move-Item -LiteralPath $temporary -Destination $target}
 }
 Write-Output 'Published local Web files; previous files preserved in isolated web directory.'
}
Write-Output "Stage: $stage"

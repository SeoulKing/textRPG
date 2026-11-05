$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$run=Join-Path $root '.runtime/godot/bed-stardew-v1'
foreach($folder in @($run,(Join-Path $run 'appdata'),(Join-Path $run 'localappdata'))){New-Item -ItemType Directory -Force $folder|Out-Null}
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
$info.WorkingDirectory=$root
$info.UseShellExecute=$false
$info.CreateNoWindow=$true
$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$info.RedirectStandardOutput=$true
$info.RedirectStandardError=$true
$info.EnvironmentVariables['APPDATA']=Join-Path $run 'appdata'
$info.EnvironmentVariables['LOCALAPPDATA']=Join-Path $run 'localappdata'
foreach($arg in @('--headless','--path','godot-arcana','--log-file',(Join-Path $run 'native-engine.log'),'--script','res://tools/author_bed.gd')){$info.ArgumentList.Add($arg)}
$job=[Diagnostics.Process]::Start($info)
$stdout=$job.StandardOutput.ReadToEndAsync();$stderr=$job.StandardError.ReadToEndAsync()
if(-not $job.WaitForExit(55000)){$job.Kill();throw 'PixelPen bed authoring exceeded 55 seconds'}
$log=$stdout.Result+$stderr.Result
[IO.File]::WriteAllText((Join-Path $run 'native.log'),$log)
$errors=$log -split "`n"|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch 'root certificate store'}
if($job.ExitCode -ne 0 -or $errors){$log|Write-Output;throw 'Native bed authoring failed'}
$log -split "`n"|Where-Object{$_ -match 'PIXELPEN_BED'}

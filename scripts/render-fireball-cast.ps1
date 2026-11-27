param([string]$ProjectPath='D:\BANG\project\textRPG\.runtime\godot\fireball-cast-v1-stage')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtime=Join-Path $root '.runtime/godot/fireball-cast-v1-render'
New-Item -ItemType Directory -Force $runtime | Out-Null
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
$start.Arguments='--path "'+$ProjectPath+'" --log-file "'+(Join-Path $runtime 'engine.log')+'" --rendering-method gl_compatibility --script res://tools/render_fireball_cast.gd'
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$start.EnvironmentVariables['APPDATA']=Join-Path $runtime 'appdata'
$start.EnvironmentVariables['LOCALAPPDATA']=Join-Path $runtime 'localappdata'
$process=[Diagnostics.Process]::Start($start);$out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
if(-not $process.WaitForExit(55000)){$process.Kill();throw 'Cast art render exceeded 55 seconds'}
$log=$out.Result+$err.Result;[IO.File]::WriteAllText((Join-Path $runtime 'render.log'),$log)
$issues=$log -split "`n"|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
if($process.ExitCode -ne 0 -or $issues){$issues|Select-Object -First 8|Write-Output;throw 'Cast art render failed'}
Write-Output 'Offline cast art sequence saved.'

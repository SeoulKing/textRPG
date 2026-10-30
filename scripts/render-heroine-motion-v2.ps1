param([string]$ProjectPath='D:\BANG\project\textRPG\.runtime\godot\heroine-motion-v2-stage')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtime=Join-Path $root '.runtime/godot/heroine-motion-v2-render'
New-Item -ItemType Directory -Force $runtime | Out-Null
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
$start.Arguments='--path "'+$ProjectPath+'" --log-file "'+(Join-Path $runtime 'engine.log')+'" --rendering-method gl_compatibility --script res://tools/render_heroine_motion_v2.gd'
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$start.EnvironmentVariables['APPDATA']=Join-Path $runtime 'appdata'
$start.EnvironmentVariables['LOCALAPPDATA']=Join-Path $runtime 'localappdata'
$process=[Diagnostics.Process]::Start($start);$out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
if(-not $process.WaitForExit(55000)){$process.Kill();throw 'Art render exceeded55seconds'}
$log=$out.Result+$err.Result;[IO.File]::WriteAllText((Join-Path $runtime 'render.log'),$log)
$issues=$log -split "`n"|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
if($process.ExitCode -ne 0 -or $issues){$issues|Select-Object -First 8|Write-Output;throw 'Art render failed'}
$dest=Join-Path $root 'godot-arcana/art/reference/heroine-motion-v2'
New-Item -ItemType Directory -Force $dest|Out-Null
foreach($name in @('standing','left-support','right-support','settling')){Copy-Item -LiteralPath (Join-Path $ProjectPath ('art/reference/heroine-motion-v2/'+$name+'.png')) -Destination $dest}
Write-Output 'Offline main-scene motion art outputs saved.'

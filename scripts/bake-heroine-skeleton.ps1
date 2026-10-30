param()
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
$info.WorkingDirectory=$root
$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle='Hidden'
$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$info.EnvironmentVariables['APPDATA']=Join-Path $root '.runtime/godot/appdata'
$info.EnvironmentVariables['LOCALAPPDATA']=Join-Path $root '.runtime/godot/localappdata'
foreach($arg in @('--path','godot-arcana','--log-file',(Join-Path $root '.runtime/godot/skeleton-bake-engine.log'),'--rendering-method','gl_compatibility','--script','res://tools/bake_heroine_skeleton.gd')){$info.ArgumentList.Add($arg)}
$p=[Diagnostics.Process]::Start($info);$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync()
if(-not $p.WaitForExit(180000)){$p.Kill();throw 'Skeleton bake timed out'}
$log=$out.Result+$err.Result;[IO.File]::WriteAllText((Join-Path $root '.runtime/godot/skeleton-bake.log'),$log)
$errors=$log -split "`n"|Where-Object {$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
if($p.ExitCode -ne 0 -or $errors){$errors|Select-Object -First 12|Write-Output;throw 'Skeleton bake failed'}
$log -split "`n" | Where-Object {$_ -match 'Skeleton baked|Native Skeleton'} | Write-Output

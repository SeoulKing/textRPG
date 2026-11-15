param([string]$StagePath='')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stage=if($StagePath){$StagePath}else{Join-Path $root '.runtime/godot/city-wall-art-release'}
$runtime=Join-Path $root '.runtime/godot'
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName=Join-Path $runtime 'Godot_v4.5.1-stable_win64_console.exe'
$info.WorkingDirectory=$root
$info.UseShellExecute=$false
$info.CreateNoWindow=$true
$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$info.RedirectStandardOutput=$true
$info.RedirectStandardError=$true
$info.EnvironmentVariables['APPDATA']=Join-Path $runtime 'appdata'
$info.EnvironmentVariables['LOCALAPPDATA']=Join-Path $runtime 'localappdata'
foreach($arg in @('--path',$stage,'--log-file',(Join-Path $runtime 'city-wall-render-engine.log'),'--rendering-method','gl_compatibility','--script','res://tools/render_city_walls.gd')){$info.ArgumentList.Add($arg)}
$process=[Diagnostics.Process]::Start($info)
$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
if(-not $process.WaitForExit(55000)){$process.Kill();throw 'City wall offline capture exceeded 55 seconds'}
$log=$stdout.Result+$stderr.Result
[IO.File]::WriteAllText((Join-Path $runtime 'city-wall-render.log'),$log)
$errors=$log -split "`n"|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
if($process.ExitCode -ne 0 -or $errors){$errors|Select-Object -First 8|Write-Output;throw 'City wall offline capture failed'}
$destination=Join-Path $root 'godot-arcana/art/reference/city-walls-v2'
New-Item -ItemType Directory -Force $destination|Out-Null
Copy-Item -LiteralPath (Join-Path $stage 'art/reference/city-walls-v2/hero-gate-scale.png') -Destination $destination
Copy-Item -LiteralPath (Join-Path $stage 'art/reference/city-walls-v2/district-overview.png') -Destination $destination
foreach($name in @('tower-faded-join.png','tower-faded-quarter.png')){Copy-Item -LiteralPath (Join-Path $stage ('art/reference/city-walls-v2/'+$name)) -Destination $destination}
Write-Output 'Captured real main scene: gate/hero scale and city overview'

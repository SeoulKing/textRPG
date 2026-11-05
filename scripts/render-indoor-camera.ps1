$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$paths=Get-Content (Join-Path $root '.runtime/godot/shop-build-paths.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Path (Join-Path $paths.stage 'tools') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'godot-arcana/tools/render_indoor_camera.gd') -Destination (Join-Path $paths.stage 'tools/render_indoor_camera.gd')
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
$info.WorkingDirectory=$root
$info.UseShellExecute=$false
$info.CreateNoWindow=$true
$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$info.RedirectStandardOutput=$true
$info.RedirectStandardError=$true
$info.EnvironmentVariables['APPDATA']=Join-Path $root '.runtime/godot/shop-appdata'
$info.EnvironmentVariables['LOCALAPPDATA']=Join-Path $root '.runtime/godot/shop-localappdata'
foreach($arg in @('--path',$paths.stage,'--log-file',(Join-Path $paths.output 'indoor-camera-render.log'),'--rendering-method','gl_compatibility','--script','res://tools/render_indoor_camera.gd')){$info.ArgumentList.Add($arg)}
$job=[Diagnostics.Process]::Start($info)
$stdout=$job.StandardOutput.ReadToEndAsync()
$stderr=$job.StandardError.ReadToEndAsync()
if(-not $job.WaitForExit(45000)){$job.Kill();throw 'Shop art rendering exceeded 45 seconds'}
$log=$stdout.Result+$stderr.Result
$log | Set-Content -Encoding utf8 (Join-Path $paths.output 'indoor-camera-output.log')
$errors=$log -split "\n" | Where-Object {$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch 'root certificate store'}
if($job.ExitCode -ne 0 -or $errors){$errors | Select-Object -First 10;throw 'Shop art render failed'}
foreach($file in @('arcana_inn-overview.png','arcana_inn-zoom.png','arcana_academy-overview.png','arcana_academy-zoom.png','arcana_restaurant-overview.png','arcana_restaurant-zoom.png')){
 Copy-Item -LiteralPath (Join-Path $paths.stage ('art/reference/indoor-camera/'+$file)) -Destination (Join-Path $root ('art-studies/interiors/solid-walls-v1/'+$file))
}
'Shop art renders saved.'

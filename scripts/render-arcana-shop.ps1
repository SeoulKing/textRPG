$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$paths=Get-Content (Join-Path $root '.runtime/godot/shop-build-paths.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Path (Join-Path $paths.stage 'tools') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'godot-arcana/tools/render_shop_interior.gd') -Destination (Join-Path $paths.stage 'tools/render_shop_interior.gd')
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
foreach($arg in @('--path',$paths.stage,'--log-file',(Join-Path $paths.output 'shop-art-render.log'),'--rendering-method','gl_compatibility','--script','res://tools/render_shop_interior.gd')){$info.ArgumentList.Add($arg)}
$job=[Diagnostics.Process]::Start($info)
$stdout=$job.StandardOutput.ReadToEndAsync()
$stderr=$job.StandardError.ReadToEndAsync()
if(-not $job.WaitForExit(45000)){$job.Kill();throw 'Shop art rendering exceeded 45 seconds'}
$log=$stdout.Result+$stderr.Result
$log | Set-Content -Encoding utf8 (Join-Path $paths.output 'shop-art-output.log')
$errors=$log -split "\n" | Where-Object {$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch 'root certificate store'}
if($job.ExitCode -ne 0 -or $errors){$errors | Select-Object -First 10;throw 'Shop art render failed'}
foreach($file in @('shop-overview.png','merchant-counter.png')){
 Copy-Item -LiteralPath (Join-Path $paths.stage ('art/reference/shop-interior/'+$file)) -Destination (Join-Path $root ('art-studies/regions/arcana-shop-interior/'+$file))
}
'Shop art renders saved.'

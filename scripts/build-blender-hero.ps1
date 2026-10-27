param()
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtime = Get-Content (Join-Path $projectRoot '.runtime/blender/runtime.json') -Raw | ConvertFrom-Json
$exe = Join-Path $projectRoot $runtime.executable
$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $exe
$startInfo.WorkingDirectory = $projectRoot
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$configRoot = Join-Path $projectRoot '.runtime/blender/config'
New-Item -ItemType Directory -Force $configRoot | Out-Null
$startInfo.EnvironmentVariables['BLENDER_USER_CONFIG'] = $configRoot
foreach ($argument in @('--background','--factory-startup','--python-exit-code','1','--python',(Join-Path $projectRoot 'scripts/blender/build_hero.py'),'--',$projectRoot)) { $startInfo.ArgumentList.Add($argument) }
$process = [Diagnostics.Process]::Start($startInfo)
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
$process.WaitForExit()
$log = $stdout.Result + $stderr.Result
[IO.File]::WriteAllText((Join-Path $projectRoot '.runtime/blender/hero-build.log'),$log)
$log -split "`n" | Select-Object -Last 16
if ($process.ExitCode -ne 0) { throw 'Blender hero build failed; see .runtime/blender/hero-build.log' }

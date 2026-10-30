param([switch]$Preview, [switch]$FinishOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $FinishOnly) {
    $runtime = Get-Content (Join-Path $projectRoot '.runtime/blender/runtime.json') -Raw | ConvertFrom-Json
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = Join-Path $projectRoot $runtime.executable
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables['BLENDER_USER_CONFIG'] = Join-Path $projectRoot '.runtime/blender/config'
    foreach ($argument in @('--background','--factory-startup','--python-exit-code','1','--python',(Join-Path $PSScriptRoot 'blender/bake_heroine_sprites.py'),'--',$projectRoot)) { $startInfo.ArgumentList.Add($argument) }
    if ($Preview) { $startInfo.ArgumentList.Add('--preview') }
    $process = [Diagnostics.Process]::Start($startInfo)
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $log = $stdout.Result + $stderr.Result
    [IO.File]::WriteAllText((Join-Path $projectRoot '.runtime/blender/heroine-sprites.log'),$log)
    $log -split "`n" | Select-Object -Last 12
    if ($process.ExitCode -ne 0) { throw 'Blender sprite bake failed; see .runtime/blender/heroine-sprites.log' }
}
& python (Join-Path $PSScriptRoot 'finish-heroine-sprites.py') $projectRoot
if ($LASTEXITCODE -ne 0) { throw 'Heroine pixel finishing failed.' }


$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=Join-Path $taskRoot '.runtime/blender/blender-4.5.15-windows-x64/blender.exe'
$info.WorkingDirectory=$taskRoot;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$info.EnvironmentVariables['BLENDER_USER_CONFIG']=Join-Path $taskRoot '.runtime/blender/config-v3'
foreach($arg in @('--background','--factory-startup','--python-exit-code','1','--python',(Join-Path $taskRoot 'scripts/blender/render_heroine_v3.py'),'--',$taskRoot)){$info.ArgumentList.Add($arg)}
$p=[Diagnostics.Process]::Start($info);$stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync();$p.WaitForExit();$log=$stdout.Result+$stderr.Result
[IO.File]::WriteAllText((Join-Path $taskRoot '.runtime/blender/heroine-v3-render.log'),$log)
$log -split "`n"|Select-Object -Last 7
if($p.ExitCode -ne 0){throw 'Blender V3 render failed'}

param([string]$Script='scripts/blender/review_heroine_v7.py',[switch]$RebuildCandidate)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$i=[Diagnostics.ProcessStartInfo]::new();$i.FileName=Join-Path $taskRoot '.runtime/blender/blender-4.5.15-windows-x64/blender.exe';$i.WorkingDirectory=$taskRoot;$i.UseShellExecute=$false;$i.CreateNoWindow=$true;$i.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden;$i.RedirectStandardOutput=$true;$i.RedirectStandardError=$true
$i.EnvironmentVariables['BLENDER_USER_CONFIG']=Join-Path $taskRoot '.runtime/blender/config-v7'
foreach($a in @('--background','--factory-startup','--python-exit-code','1','--python',(Join-Path $taskRoot $Script),'--',$taskRoot)){$i.ArgumentList.Add($a)}
if($RebuildCandidate){$i.ArgumentList.Add('--replace-candidate')}
$p=[Diagnostics.Process]::Start($i);$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync();$p.WaitForExit();$log=$out.Result+$err.Result;[IO.File]::WriteAllText((Join-Path $taskRoot '.runtime/blender/heroine-v7.log'),$log);$log -split "`n"|Select-Object -Last 14
if($p.ExitCode -ne 0){throw 'V7 operation failed; inspect .runtime/blender/heroine-v7.log'}

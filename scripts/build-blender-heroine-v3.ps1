param([switch]$SkipRender,[switch]$ExportEditedSource,[switch]$RebuildFromRecipe)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $ExportEditedSource -and -not $RebuildFromRecipe -and (Test-Path -LiteralPath (Join-Path $taskRoot 'art-studies/arcana-hero/white-bob-heroine/blender-v3/heroine-v3.blend'))){throw 'Source exists. Use -ExportEditedSource to preserve edits or -RebuildFromRecipe to explicitly recreate it.'}
$taskScript=if($ExportEditedSource){'scripts/blender/export_heroine_v3.py'}else{'scripts/blender/build_heroine_v3.py'}
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName=Join-Path $taskRoot '.runtime/blender/blender-4.5.15-windows-x64/blender.exe'
$info.WorkingDirectory=$taskRoot;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
$info.EnvironmentVariables['BLENDER_USER_CONFIG']=Join-Path $taskRoot '.runtime/blender/config-v3'
foreach($arg in @('--background','--factory-startup','--python-exit-code','1','--python',(Join-Path $taskRoot $taskScript),'--',$taskRoot)){$info.ArgumentList.Add($arg)}
if($SkipRender){$info.ArgumentList.Add('--no-render')}
$p=[Diagnostics.Process]::Start($info);$stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync()
$p.WaitForExit();$log=$stdout.Result+$stderr.Result
[IO.File]::WriteAllText((Join-Path $taskRoot '.runtime/blender/heroine-v3-build.log'),$log)
$log -split "`n"|Select-Object -Last 12
if($p.ExitCode -ne 0){throw 'V3 Blender build failed; inspect .runtime/blender/heroine-v3-build.log'}

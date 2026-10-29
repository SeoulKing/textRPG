param([string]$StagePath="")
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stamp=[DateTime]::Now.ToString('yyyyMMdd-HHmmss')
$stage=if($StagePath){$StagePath}else{Join-Path $root ('.runtime/godot/shop-runtime-'+$stamp)}
$output=Join-Path $root ('.runtime/godot/shop-build-'+$stamp)
New-Item -ItemType Directory -Force $stage,$output|Out-Null
$copyLog=Join-Path $output 'copy.log'
$sourceArt=Join-Path $root 'godot-arcana/art/source'
$referenceArt=Join-Path $root 'godot-arcana/art/reference'
& robocopy (Join-Path $root 'godot-arcana') $stage /E /R:0 /W:0 /XJ /XD addons .godot tools $sourceArt $referenceArt /NFL /NDL /NJH /NJS /NP "/LOG:$copyLog" | Out-Null
if($LASTEXITCODE -gt 7){Get-Content $copyLog -Tail 15;throw 'Runtime copy failed'}
New-Item -ItemType Directory -Force (Join-Path $stage 'art/source')|Out-Null
Copy-Item -LiteralPath (Join-Path $sourceArt 'kit.json') -Destination (Join-Path $stage 'art/source/kit.json')
$project=Join-Path $stage 'project.godot'
$text=[IO.File]::ReadAllText($project)
$text=[regex]::Replace($text,'(?ms)\[editor_plugins\]\s*.*?(?=\[filesystem\])','')
[IO.File]::WriteAllText($project,$text)
$preset=Join-Path $stage 'export_presets.cfg'
$text=[IO.File]::ReadAllText($preset).Replace('../.runtime/godot/web_nothreads_release.zip',(Join-Path $root '.runtime/godot/web_nothreads_release.zip').Replace('\','/'))
[IO.File]::WriteAllText($preset,$text)
$godot=Join-Path $root '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
foreach($step in @('import','export')){
 $args=@('--headless','--path',$stage,'--log-file',(Join-Path $output ($step+'-engine.log')))
 if($step -eq 'import'){$args+=@('--editor','--import','--quit')}else{$args+=@('--export-release','Web',(Join-Path $output 'index.html'))}
 $ErrorActionPreference='Continue'
 $result=@(& $godot @args 2>&1|ForEach-Object{"$_"});$code=$LASTEXITCODE
 $ErrorActionPreference='Stop'
 $result|Set-Content -Encoding utf8 (Join-Path $output ($step+'.log'))
 $errors=$result|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
 if($code -ne 0 -or $errors){$errors|Select-Object -First 12|Write-Output;throw "Shop runtime $step failed"}
}
@{stage=$stage;output=$output}|ConvertTo-Json|Set-Content -Encoding utf8 (Join-Path $root '.runtime/godot/shop-build-paths.json')
Write-Output "Shop Web export complete: $output"

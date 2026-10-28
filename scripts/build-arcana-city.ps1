param([string]$StagePath="",[switch]$AuthorGround,[switch]$Render,[switch]$Export)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtime=Join-Path $root '.runtime/godot'
$stage=if($StagePath){[IO.Path]::GetFullPath($StagePath)}else{Join-Path $runtime ('city-center-stage-'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss'))}
New-Item -ItemType Directory -Force $stage|Out-Null
& robocopy (Join-Path $root 'godot-arcana') $stage /E /XD addons .godot /NFL /NDL /NJH /NJS /NP | Out-Null
if($LASTEXITCODE -gt 7){throw 'City runtime copy failed'}
# Source masters and old reference captures are not runtime resources. Keep them
# in the original project; skip their imports only in this isolated build copy.
foreach($directory in Get-ChildItem -LiteralPath (Join-Path $stage 'art/source') -Directory){
 [IO.File]::WriteAllText((Join-Path $directory.FullName '.gdignore'),'')
}
foreach($relative in @('art/reference','art/style-studies')){
 $directory=Join-Path $stage $relative
 if(Test-Path -LiteralPath $directory){[IO.File]::WriteAllText((Join-Path $directory '.gdignore'),'')}
}
$project=Join-Path $stage 'project.godot'
$text=[regex]::Replace([IO.File]::ReadAllText($project),'(?ms)\[editor_plugins\]\s*.*?(?=\[filesystem\])','')
[IO.File]::WriteAllText($project,$text)
$preset=Join-Path $stage 'export_presets.cfg'
$text=[IO.File]::ReadAllText($preset).Replace('../.runtime/godot/web_nothreads_release.zip',(Join-Path $runtime 'web_nothreads_release.zip').Replace('\','/'))
[IO.File]::WriteAllText($preset,$text)
[IO.File]::WriteAllText((Join-Path $runtime 'city-center-stage-path.txt'),$stage)
$env:APPDATA=Join-Path $runtime 'city-center-appdata'
$env:LOCALAPPDATA=Join-Path $runtime 'city-center-localappdata'
$godot=Join-Path $runtime 'Godot_v4.5.1-stable_win64_console.exe'
function Invoke-CityGodot([string]$name,[string[]]$arguments){
 $ErrorActionPreference='Continue'
 $output=@(& $godot --headless --path $stage --log-file (Join-Path $stage ($name+'-engine.log')) @arguments 2>&1|ForEach-Object{"$_"})
 $code=$LASTEXITCODE
 $ErrorActionPreference='Stop'
 [IO.File]::WriteAllLines((Join-Path $stage ($name+'.log')),$output)
 $errors=$output|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
 if($code -ne 0 -or $errors){$errors|Select-Object -First 8|Write-Output;throw "City $name failed: $stage/$name.log"}
 Write-Output "$name complete."
}
Invoke-CityGodot 'import' @('--editor','--import','--quit')
if($AuthorGround){
 Invoke-CityGodot 'author-ground' @('--script','res://tools/author_city_ground.gd','--',(Join-Path $root 'art-studies/regions/arcana-city-center/layout.json'))
 Copy-Item -LiteralPath (Join-Path $stage 'scenes/ground/city_ground.tscn') -Destination (Join-Path $root 'godot-arcana/scenes/ground/city_ground.tscn')
}
Invoke-CityGodot 'combat-layout' @('--script','res://tools/export_combat_layout.gd')
Copy-Item -LiteralPath (Join-Path $stage 'art/export/combat-layout.json') -Destination (Join-Path $root 'godot-arcana/art/export/combat-layout.json')
if($Render){
 $start=[Diagnostics.ProcessStartInfo]::new()
 $start.FileName=$godot
 $start.WorkingDirectory=$root
 $start.UseShellExecute=$false
 $start.CreateNoWindow=$true
 $start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
 $start.RedirectStandardOutput=$true
 $start.RedirectStandardError=$true
 foreach($argument in @('--path',$stage,'--log-file',(Join-Path $stage 'city-render-engine.log'),'--rendering-method','gl_compatibility','--script','res://tools/render_city_center.gd')){$start.ArgumentList.Add($argument)}
 $process=[Diagnostics.Process]::Start($start)
 $stdout=$process.StandardOutput.ReadToEndAsync()
 $stderr=$process.StandardError.ReadToEndAsync()
 if(-not $process.WaitForExit(55000)){$process.Kill();throw 'City render exceeded 55 seconds'}
 $log=$stdout.Result+$stderr.Result
 [IO.File]::WriteAllText((Join-Path $stage 'city-render.log'),$log)
 $errors=$log -split "`n"|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.'}
 if($process.ExitCode -ne 0 -or $errors){$errors|Select-Object -First 8|Write-Output;throw 'City art render failed'}
 $capture=Join-Path $root 'art-studies/regions/arcana-city-center/render'
 New-Item -ItemType Directory -Force $capture|Out-Null
 Copy-Item -LiteralPath (Join-Path $stage 'art/reference/city-center/district-overview.png') -Destination (Join-Path $capture 'district-overview.png')
 Copy-Item -LiteralPath (Join-Path $stage 'art/reference/city-center/southern-street.png') -Destination (Join-Path $capture 'southern-street.png')
 Copy-Item -LiteralPath (Join-Path $stage 'art/reference/city-center/shop-street.png') -Destination (Join-Path $capture 'shop-street.png')
 Copy-Item -LiteralPath (Join-Path $stage 'art/reference/city-center/ground-detail.png') -Destination (Join-Path $capture 'ground-detail.png')
 Write-Output 'City art renders saved.'
}
if($Export){
 $web=Join-Path $stage 'web'
 New-Item -ItemType Directory -Force $web|Out-Null
 Invoke-CityGodot 'web-export' @('--export-release','Web',(Join-Path $web 'index.html'))
 & (Join-Path $PSScriptRoot 'publish-arcana-city-web.ps1') -StagePath $stage
 Write-Output 'City Web export published to existing godot-web folder.'
}
Write-Output "City stage: $stage"
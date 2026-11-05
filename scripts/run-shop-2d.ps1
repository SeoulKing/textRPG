param([ValidateSet('Sync','Import','Native','Build','Check','Capture','Layout','Flow')][string]$Action,[switch]$RebuildLibrary)
$ErrorActionPreference='Stop'
$rootPath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runPath=Join-Path $rootPath '.runtime/godot/shop-2d'
$stagePath=Join-Path $runPath 'project'
New-Item -ItemType Directory -Force $runPath,$stagePath,(Join-Path $runPath 'appdata'),(Join-Path $runPath 'localdata')|Out-Null
if($Action -eq 'Sync'){
 & robocopy (Join-Path $rootPath 'godot-arcana') $stagePath /E /XD .godot /NFL /NDL /NJH /NJS /NP|Out-Null
 if($LASTEXITCODE -gt 7){throw 'Shop stage copy failed'}
 $settingsPath=Join-Path $stagePath 'project.godot'
 $settings=[IO.File]::ReadAllText($settingsPath)
 $settings=[regex]::Replace($settings,'(?ms)\[editor_plugins\]\s*.*?(?=\[filesystem\])','')
 [IO.File]::WriteAllText($settingsPath,$settings)
 foreach ($relative in @('art/source','art/reference')) {
  [IO.File]::WriteAllText((Join-Path $stagePath ($relative+'/.gdignore')),'')
 }
 'SHOP_2D isolated project ready'
 exit 0
}
$info=[Diagnostics.ProcessStartInfo]::new()
$info.FileName=Join-Path $rootPath '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe'
$info.WorkingDirectory=$rootPath
$info.UseShellExecute=$false
$info.CreateNoWindow=$true
$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$info.RedirectStandardOutput=$true
$info.RedirectStandardError=$true
$info.EnvironmentVariables['APPDATA']=Join-Path $runPath 'appdata'
$info.EnvironmentVariables['LOCALAPPDATA']=Join-Path $runPath 'localdata'
$info.EnvironmentVariables['ARCANA_SHOP_PLAN']=Join-Path $rootPath 'art-studies/regions/arcana-shop-interior/source/native-2d/pixelpen-plan.json'
$info.EnvironmentVariables['ARCANA_SHOP_DRAFT']=Join-Path $rootPath 'art-studies/regions/arcana-shop-interior/source/tilemap-v2/layout-draft.json'
$info.EnvironmentVariables['ARCANA_SHOP_EVIDENCE']=Join-Path $rootPath 'art-studies/regions/arcana-shop-interior/source/native-2d'
$arguments=@('--path',$stagePath,'--log-file',(Join-Path $runPath ($Action+'.engine.log')))
switch($Action){
 'Import'{$arguments+=@('--headless','--editor','--import','--quit')}
 'Native'{$arguments+=@('--headless','--script','res://tools/author_shop_2d.gd')}
 'Build'{$arguments+=@('--headless','--script','res://tools/build_shop_2d.gd')}
 'Flow'{$arguments+=@('--rendering-method','gl_compatibility','--script','res://tools/flow_shop_2d.gd')}
 'Layout'{$arguments+=@('--headless','--script','res://tools/export_online_layout.gd')}
 'Check'{$arguments+=@('--headless','--script','res://tools/check_shop_2d.gd')}
 'Capture'{$arguments+=@('--rendering-method','gl_compatibility','--script','res://tools/capture_shop_2d.gd')}
}
if($Action -eq 'Build' -and $RebuildLibrary){$arguments+=@('--','--rebuild-library')}
foreach($arg in $arguments){$info.ArgumentList.Add($arg)}
$job=[Diagnostics.Process]::Start($info)
$stdout=$job.StandardOutput.ReadToEndAsync();$stderr=$job.StandardError.ReadToEndAsync()
if(-not $job.WaitForExit(55000)){$job.Kill();throw ($Action+' exceeded 55 seconds')}
$log=$stdout.Result+$stderr.Result
[IO.File]::WriteAllText((Join-Path $runPath ($Action+'.log')),$log)
$errors=$log -split "`n"|Where-Object{$_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch 'root certificate store'}
if($job.ExitCode -ne 0 -or $errors){$errors|Select-Object -First 12;throw ($Action+' failed')}
if($Action -eq 'Native'){
 foreach($folder in @('art/source/shop-2d-v3','art/export/shop-2d')){
  Get-ChildItem -LiteralPath (Join-Path $stagePath $folder) -File | Where-Object {$_.Extension -in @('.png','.pxpen')} | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $rootPath ('godot-arcana/'+$folder+'/'+$_.Name))}
 }
}
if($Action -eq 'Build'){
 foreach($relative in @('art/resources/shop_2d_tileset.tres','scenes/shop_2d.tscn')){
  Copy-Item -LiteralPath (Join-Path $stagePath $relative) -Destination (Join-Path $rootPath ('godot-arcana/'+$relative))
 }
}
$log -split "`n"|Where-Object{$_ -match 'SHOP_2D'}|Select-Object -Last 7
'Completed '+$Action

if($Action -eq 'Layout') {
 $fresh=Get-Content -LiteralPath (Join-Path $stagePath 'art/export/online-layout.json') -Raw|ConvertFrom-Json
 $destination=Join-Path $rootPath 'godot-arcana/art/export/online-layout.json'
 $existing=Get-Content -LiteralPath $destination -Raw|ConvertFrom-Json
 $existing.arcana_shop=$fresh.arcana_shop
 [IO.File]::WriteAllText($destination,($existing|ConvertTo-Json -Depth 40))
}

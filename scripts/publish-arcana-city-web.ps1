param([Parameter(Mandatory=$true)][string]$StagePath)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stage=[IO.Path]::GetFullPath($StagePath)
$runtimePrefix=([IO.Path]::GetFullPath((Join-Path $root '.runtime/godot'))).TrimEnd('\')+'\'
if(-not $stage.StartsWith($runtimePrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'City stage must stay inside this project runtime'}
$web=Join-Path $stage 'web'
$destination=Join-Path $root 'godot-web'
$updated=@();$unchanged=@()
foreach($file in Get-ChildItem -LiteralPath $web -File){
 $target=Join-Path $destination $file.Name
 if(Test-Path -LiteralPath $target){
  if((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash){$unchanged+=$file.Name;continue}
  $pending=$target+'.city-pending'
  Copy-Item -LiteralPath $file.FullName -Destination $pending -Force
  [IO.File]::Replace($pending,$target,(Join-Path $stage ('previous-'+$file.Name)))
 }else{Copy-Item -LiteralPath $file.FullName -Destination $target}
 $updated+=$file.Name
}
Write-Output ('City Web publication complete. Updated: '+($updated -join ', ')+'; unchanged: '+($unchanged -join ', '))
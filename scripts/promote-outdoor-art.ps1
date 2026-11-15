$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRun=Join-Path $root '.runtime/godot/outdoor-unified-v1'
$built=Join-Path $taskRun 'web'
$backup=Join-Path $taskRun ('previous-web-'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss'))
$delivery=Join-Path $root '.server-dist/godot'
New-Item -ItemType Directory -Force $backup,$delivery|Out-Null
$changed=@()
foreach($name in @('index.html','index.js','index.wasm','index.pck','index.png','index.audio.worklet.js','index.audio.position.worklet.js')){
 $source=Join-Path $built $name
 if(-not(Test-Path -LiteralPath $source)){throw ('Missing Web output: '+$name)}
 $hash=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
 foreach($target in @((Join-Path $root ('godot-web/'+$name)),(Join-Path $delivery $name))){
  $same=(Test-Path -LiteralPath $target) -and ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $hash)
  if(-not $same){
   $pending=$target+'.outdoor-pending'
   Copy-Item -LiteralPath $source -Destination $pending -Force
   if(Test-Path -LiteralPath $target){[IO.File]::Replace($pending,$target,(Join-Path $backup ((Split-Path (Split-Path $target -Parent) -Leaf)+'-'+$name)),$true)}else{[IO.File]::Move($pending,$target)}
   $changed+=$target
  }
  if($target.StartsWith($delivery) -and $name -match '\.(js|wasm|pck)$' -and (-not $same -or -not(Test-Path -LiteralPath ($target+'.gz')))){
   $packed=$target+'.gz.outdoor-pending'
   $inputStream=[IO.File]::OpenRead($target)
   $outputStream=[IO.File]::Create($packed)
   $gzip=[IO.Compression.GZipStream]::new($outputStream,[IO.Compression.CompressionLevel]::Optimal)
   try{$inputStream.CopyTo($gzip)}finally{$inputStream.Dispose();$gzip.Dispose();$outputStream.Dispose()}
   if(Test-Path -LiteralPath ($target+'.gz')){[IO.File]::Replace($packed,$target+'.gz',(Join-Path $backup ('godot-'+$name+'.gz')),$true)}else{[IO.File]::Move($packed,$target+'.gz')}
  }
 }
}
$rawHash=(Get-FileHash -LiteralPath (Join-Path $root 'godot-web/index.pck') -Algorithm SHA256).Hash
$inputStream=[IO.File]::OpenRead((Join-Path $delivery 'index.pck.gz'))
$gzip=[IO.Compression.GZipStream]::new($inputStream,[IO.Compression.CompressionMode]::Decompress)
$sha=[Security.Cryptography.SHA256]::Create()
try{$gzipHash=[Convert]::ToHexString($sha.ComputeHash($gzip))}finally{$sha.Dispose();$gzip.Dispose();$inputStream.Dispose()}
if($gzipHash -ne $rawHash){throw 'Delivered raw/gzip PCK differ'}
[IO.File]::WriteAllText((Join-Path $taskRun 'delivery.json'),(@{pckSha256=$rawHash;backup=$backup;changed=$changed;sourcePackage=(Join-Path $built 'index.pck')}|ConvertTo-Json -Depth 4))
'Outdoor Web delivery updated; '+$changed.Count+' files changed; raw/gzip SHA256 '+$rawHash

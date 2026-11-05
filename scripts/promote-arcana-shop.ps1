$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$paths=Get-Content (Join-Path $root '.runtime/godot/shop-build-paths.json') -Raw | ConvertFrom-Json
$backup=Join-Path $paths.output 'previous-web'
$delivery=Join-Path $root '.server-dist/godot'
New-Item -ItemType Directory -Path $backup,$delivery -Force|Out-Null
$changed=@()
foreach($name in @('index.html','index.js','index.wasm','index.pck','index.png','index.audio.worklet.js','index.audio.position.worklet.js')){
 $source=Join-Path $paths.output $name
 if(-not(Test-Path -LiteralPath $source)){throw "Missing Web export: $name"}
 $hash=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
 foreach($destination in @((Join-Path $root ('godot-web/'+$name)),(Join-Path $delivery $name))){
  $same=(Test-Path -LiteralPath $destination) -and ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -eq $hash)
  if(-not $same){
   $pending=$destination+'.shop-pending'
   Copy-Item -LiteralPath $source -Destination $pending -Force
   if(Test-Path -LiteralPath $destination){
    $old=Join-Path $backup ((Split-Path (Split-Path $destination -Parent) -Leaf)+'-'+$name)
    [IO.File]::Replace($pending,$destination,$old,$true)
   }else{[IO.File]::Move($pending,$destination)}
   $changed+=$destination
  }
  if($destination.StartsWith($delivery) -and $name -match '\.(js|wasm|pck)$' -and (-not $same -or -not(Test-Path -LiteralPath ($destination+'.gz')))){
   $compressed=$destination+'.gz.shop-pending'
   $inputStream=[IO.File]::OpenRead($destination)
   $outputStream=[IO.File]::Create($compressed)
   $gzip=[IO.Compression.GZipStream]::new($outputStream,[IO.Compression.CompressionLevel]::Optimal)
   try{$inputStream.CopyTo($gzip)}finally{$inputStream.Dispose();$gzip.Dispose();$outputStream.Dispose()}
   if(Test-Path -LiteralPath ($destination+'.gz')){
    [IO.File]::Replace($compressed,$destination+'.gz',(Join-Path $backup ('godot-'+$name+'.gz')),$true)
   }else{[IO.File]::Move($compressed,$destination+'.gz')}
  }
 }
}
$rawHash=(Get-FileHash -LiteralPath (Join-Path $root 'godot-web/index.pck') -Algorithm SHA256).Hash
$inputStream=[IO.File]::OpenRead((Join-Path $delivery 'index.pck.gz'))
$gzip=[IO.Compression.GZipStream]::new($inputStream,[IO.Compression.CompressionMode]::Decompress)
$sha=[Security.Cryptography.SHA256]::Create()
try{$compressedHash=[Convert]::ToHexString($sha.ComputeHash($gzip))}finally{$sha.Dispose();$gzip.Dispose();$inputStream.Dispose()}
if($compressedHash -ne $rawHash){throw 'Compressed delivery differs from current Web export'}
$changed
'Web delivery ready: '+$rawHash

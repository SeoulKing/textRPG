param([Parameter(Mandatory=$true)][string]$BuildOutput)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$buildDirectory=[IO.Path]::GetFullPath($BuildOutput)
if(-not $buildDirectory.StartsWith((Join-Path $taskRoot '.runtime/godot/online-build-'),[StringComparison]::OrdinalIgnoreCase)){throw 'Use the isolated plaza build output'}
$backupDirectory=Join-Path (Split-Path $buildDirectory -Parent) 'previous-local-web'
New-Item -ItemType Directory -Path $backupDirectory -Force|Out-Null
$destinations=@((Join-Path $taskRoot 'godot-web'),(Join-Path $taskRoot '.server-dist/godot'))
$changed=@()
foreach($destination in $destinations){
 New-Item -ItemType Directory -Path $destination -Force|Out-Null
 foreach($name in @('index.html','index.js','index.wasm','index.pck','index.png','index.audio.worklet.js','index.audio.position.worklet.js')){
  $source=Join-Path $buildDirectory $name
  if(-not (Test-Path -LiteralPath $source)){throw "Missing build file $name"}
  $target=Join-Path $destination $name
  $same=(Test-Path -LiteralPath $target) -and ((Get-FileHash -LiteralPath $target).Hash -eq (Get-FileHash -LiteralPath $source).Hash)
  if(-not $same){
   $pending=$target+'.plaza-pending'
   Copy-Item -LiteralPath $source -Destination $pending
   if(Test-Path -LiteralPath $target){
    $backup=Join-Path $backupDirectory ((Split-Path $destination -Leaf)+'-'+$name)
    [IO.File]::Replace($pending,$target,$backup,$true)
   }else{[IO.File]::Move($pending,$target)}
   $changed+=$target
  }
  if($name -match '\.(js|wasm|pck)$' -and (-not $same -or -not (Test-Path -LiteralPath ($target+'.gz')))){
   $pendingGzip=$target+'.gz.plaza-pending'
   $inputStream=[IO.File]::OpenRead($target)
   $outputStream=[IO.File]::Create($pendingGzip)
   $gzip=[IO.Compression.GZipStream]::new($outputStream,[IO.Compression.CompressionLevel]::Optimal)
   try{$inputStream.CopyTo($gzip)}finally{$inputStream.Dispose();$gzip.Dispose();$outputStream.Dispose()}
   if(Test-Path -LiteralPath ($target+'.gz')){
    [IO.File]::Replace($pendingGzip,$target+'.gz',(Join-Path $backupDirectory ((Split-Path $destination -Leaf)+'-'+$name+'.gz')),$true)
   }else{[IO.File]::Move($pendingGzip,$target+'.gz')}
  }
 }
}
$sha=(Get-FileHash -LiteralPath (Join-Path $buildDirectory 'index.pck')).Hash
[PSCustomObject]@{ChangedFiles=$changed.Count;PckSha256=$sha}

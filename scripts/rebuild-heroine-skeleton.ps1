$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$result=Join-Path $root '.runtime/godot/skeleton-rebuild-result.json'
try {
    & (Join-Path $PSScriptRoot 'bake-heroine-skeleton.ps1')
    & node (Join-Path $PSScriptRoot 'build-arcana-reference-art.cjs') --hero-only
    if($LASTEXITCODE -ne 0){throw 'Atlas generation failed'}
    [IO.File]::WriteAllText($result,'{"ok":true}')
} catch {
    [IO.File]::WriteAllText($result,('{"ok":false,"error":'+(ConvertTo-Json -Compress ([string]$_))+'}'))
    throw
}

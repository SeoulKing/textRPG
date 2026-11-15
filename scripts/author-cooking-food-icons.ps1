param([string]$GodotPath = "")
$ErrorActionPreference = 'Stop'
$itemRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $GodotPath) { $GodotPath = Join-Path $itemRoot '.runtime/godot/Godot_v4.5.1-stable_win64_console.exe' }
$itemRuntime = Join-Path $itemRoot '.runtime/godot/cooking-food-icons'
$itemAppData = Join-Path $itemRuntime 'appdata'
$itemLocalData = Join-Path $itemRuntime 'localappdata'
New-Item -ItemType Directory -Force -Path $itemAppData,$itemLocalData | Out-Null
$itemPreviousAppData = $env:APPDATA
$itemPreviousLocalData = $env:LOCALAPPDATA
try {
    $env:APPDATA = $itemAppData
    $env:LOCALAPPDATA = $itemLocalData
    $ErrorActionPreference = 'Continue'
    $itemOutput = @(& $GodotPath --headless --path (Join-Path $itemRoot 'godot-arcana') --log-file (Join-Path $itemRuntime 'engine.log') --script res://tools/author_cooking_food_icons.gd 2>&1 | ForEach-Object { "$_" })
    $itemCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    $itemOutput | Set-Content -Encoding utf8 (Join-Path $itemRuntime 'author.log')
    $itemErrors = @($itemOutput | Where-Object { $_ -match 'SCRIPT ERROR|Parse Error|ERROR:' -and $_ -notmatch '^ERROR: Failed to read the root certificate store\.' })
    if ($itemCode -ne 0 -or $itemErrors.Count -gt 0) { $itemErrors | Write-Output; throw 'Item thumbnail authoring failed.' }
    $itemOutput | Where-Object { $_ -match '^PIXELPEN_ITEM_EXPORTED' } | Write-Output
}
finally {
    $env:APPDATA = $itemPreviousAppData
    $env:LOCALAPPDATA = $itemPreviousLocalData
}


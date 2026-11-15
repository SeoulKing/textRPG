param([string]$GodotPath = "", [switch]$PrepareTools, [string]$OutputPath = "")
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($PrepareTools) {
  & python (Join-Path $PSScriptRoot 'download-godot-tools.py')
  if ($LASTEXITCODE -ne 0) { throw 'Godot build tools could not be prepared.' }
}
# The runtime-only builder keeps PixelPen/native editor extensions out of export,
# validates the PCK independently, and atomically refreshes raw/gzip delivery files.
$buildArguments = @{ Publish = $true }
if ($GodotPath) { $buildArguments.GodotPath = $GodotPath }
if ($OutputPath) { $buildArguments.WebOutputPath = $OutputPath }
& (Join-Path $PSScriptRoot 'build-arcana-online.ps1') @buildArguments

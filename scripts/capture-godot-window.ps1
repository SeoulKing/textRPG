param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 2147483647)]
    [int]$WindowHandle,
    [string]$OutputPath = "",
    [string]$CaptureHelper = ""
)
$ErrorActionPreference = 'Stop'

# Keep GetWindowRect and CopyFromScreen in physical pixels on scaled displays.
# This affects this capture process only, not Windows display settings.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ArcanaCaptureDpi {
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
try {
    if (-not [ArcanaCaptureDpi]::SetProcessDpiAwarenessContext([IntPtr](-4))) {
        [void][ArcanaCaptureDpi]::SetProcessDPIAware()
    }
} catch [System.EntryPointNotFoundException] {
    [void][ArcanaCaptureDpi]::SetProcessDPIAware()
}

# Use the screenshot skill's GDI path when Computer Use's window-frame capture
# times out. The window must be visible: occluding windows are also captured.
# Pass a fresh handle from Computer Use's window inventory; do not guess it.
if (-not $CaptureHelper) {
    $CaptureHelper = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex/skills/screenshot/scripts/take_screenshot.ps1'
}
if (-not (Test-Path -LiteralPath $CaptureHelper -PathType Leaf)) {
    throw "Screenshot skill helper is missing: $CaptureHelper"
}
if (-not $OutputPath) {
    $OutputPath = Join-Path ([IO.Path]::GetTempPath()) 'arcana-godot-window.png'
}
# One stable output file avoids accumulating timestamped inspection images.
& $CaptureHelper -WindowHandle $WindowHandle -Path $OutputPath

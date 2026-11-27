param(
    [Parameter(Mandatory = $true)][int]$WindowHandle,
    [Parameter(Mandatory = $true)][ValidateSet('Click','DoubleClick','WheelUp','WheelDown','HoldRight','HoldLeft','HoldUp','HoldDown','TypeText','SaveScene','RunEditorScript','QuickOpenScript')][string]$Action,
    [Parameter(Mandatory = $true)][int]$X,
    [Parameter(Mandatory = $true)][int]$Y,
    [ValidateRange(1,20)][int]$Repeat = 1,
    [ValidateRange(1,1500)][int]$HoldMilliseconds = 600,
    [switch]$PauseAfter,
    [ValidatePattern('^[a-z0-9.]{1,32}$')][string]$Text = 'bone',
    [switch]$DoubleFocus,
    [switch]$Commit
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ArcanaGodotInput {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; public POINT(int x,int y) { X=x; Y=y; } }
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint id);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] public static extern bool IsChild(IntPtr parent, IntPtr child);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
    [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
}
'@
[void][ArcanaGodotInput]::SetProcessDpiAwarenessContext([IntPtr](-4))
$handle = [IntPtr]$WindowHandle
$targetPid = [uint32]0
[void][ArcanaGodotInput]::GetWindowThreadProcessId($handle, [ref]$targetPid)
$targetProcess = Get-Process -Id $targetPid -ErrorAction Stop
if ($targetProcess.ProcessName -notmatch '^Godot_v4\.7\.2-stable_win64(?:_console)?$') { throw 'Input target is not the authorized Godot editor/game' }
$rect = New-Object ArcanaGodotInput+RECT
if (-not [ArcanaGodotInput]::GetWindowRect($handle,[ref]$rect)) { throw 'Window bounds unavailable' }
if ($X -lt 0 -or $Y -lt 0 -or $X -ge ($rect.Right-$rect.Left) -or $Y -ge ($rect.Bottom-$rect.Top)) { throw 'Point outside target window' }
[void][ArcanaGodotInput]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 150
$owner = [ArcanaGodotInput]::GetAncestor($handle,3)
if ([ArcanaGodotInput]::GetAncestor([ArcanaGodotInput]::GetForegroundWindow(),3) -ne $owner) {
    # Windows may reject programmatic activation. Click only the visible native
    # title bar of this verified Godot window, then repeat the foreground check.
    $titleX = $rect.Left + 128
    $titleY = $rect.Top + 20
    $titleHit = [ArcanaGodotInput]::WindowFromPoint((New-Object ArcanaGodotInput+POINT($titleX,$titleY)))
    if ([ArcanaGodotInput]::GetAncestor($titleHit,2) -ne [ArcanaGodotInput]::GetAncestor($handle,2)) { throw 'Godot title bar is obscured; no input sent' }
    if (-not [ArcanaGodotInput]::SetCursorPos($titleX,$titleY)) { throw 'Cannot position cursor on Godot title bar; no input sent' }
    [ArcanaGodotInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
    Start-Sleep -Milliseconds 150
    if ([ArcanaGodotInput]::GetAncestor([ArcanaGodotInput]::GetForegroundWindow(),3) -ne $owner) { throw 'Godot is not foreground; no edit input sent' }
}
$sx = $rect.Left + $X
$sy = $rect.Top + $Y
$hit = [ArcanaGodotInput]::WindowFromPoint((New-Object ArcanaGodotInput+POINT($sx,$sy)))
$hitPid = [uint32]0
[void][ArcanaGodotInput]::GetWindowThreadProcessId($hit, [ref]$hitPid)
if ($hitPid -ne $targetPid) {
    $hitProcess = Get-Process -Id $hitPid -ErrorAction Stop
    $embeddedRun = Get-CimInstance Win32_Process -Filter "ProcessId=$hitPid"
    if ((-not [ArcanaGodotInput]::IsChild($handle,$hit) -and $embeddedRun.ParentProcessId -ne $targetPid) -or $hitProcess.ProcessName -notmatch '^Godot_v4\.7\.2-stable_win64(?:_console)?$') {
        throw "Point is obscured; target=$targetPid hit=$hitPid process=$($hitProcess.ProcessName) window=$hit root=$([ArcanaGodotInput]::GetAncestor($hit,2)); no input sent"
    }
}
if (-not [ArcanaGodotInput]::SetCursorPos($sx,$sy)) { throw 'Cannot position cursor; no input sent' }
if ($Action -eq 'QuickOpenScript') {
    [ArcanaGodotInput]::keybd_event(17,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(18,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(79,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(79,0,2,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(18,0,2,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(17,0,2,[UIntPtr]::Zero)
    Write-Output 'Godot quick-open script shortcut sent'
    exit
}
if ($Action -eq 'RunEditorScript') {
    [ArcanaGodotInput]::keybd_event(17,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(16,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(88,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(88,0,2,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(16,0,2,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(17,0,2,[UIntPtr]::Zero)
    Write-Output 'Godot editor script run shortcut sent'
    exit
}
if ($Action -eq 'SaveScene') {
    [ArcanaGodotInput]::keybd_event(17,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(83,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(83,0,2,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(17,0,2,[UIntPtr]::Zero)
    Write-Output 'Godot current scene saved'
    exit
}
if ($Action -eq 'TypeText') {
    [ArcanaGodotInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
    if ($DoubleFocus) {
        Start-Sleep -Milliseconds 70
        [ArcanaGodotInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
        [ArcanaGodotInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
    }
    [ArcanaGodotInput]::keybd_event(17,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(65,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(65,0,2,[UIntPtr]::Zero)
    [ArcanaGodotInput]::keybd_event(17,0,2,[UIntPtr]::Zero)
    foreach ($c in $Text.ToCharArray()) {
        $vk = if ($c -eq '.') { [byte]190 } else { [byte][char]([string]$c).ToUpperInvariant() }
        [ArcanaGodotInput]::keybd_event($vk,0,0,[UIntPtr]::Zero)
        [ArcanaGodotInput]::keybd_event($vk,0,2,[UIntPtr]::Zero)
    }
    if ($Commit) {
        [ArcanaGodotInput]::keybd_event(13,0,0,[UIntPtr]::Zero)
        [ArcanaGodotInput]::keybd_event(13,0,2,[UIntPtr]::Zero)
    }
    Write-Output 'Godot text entered'
    exit
}
if ($Action.StartsWith('Hold')) {
    [ArcanaGodotInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    [ArcanaGodotInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
    $virtualKey = [byte]@{HoldLeft=37;HoldUp=38;HoldRight=39;HoldDown=40}[$Action]
    try {
        [ArcanaGodotInput]::keybd_event($virtualKey,0,0,[UIntPtr]::Zero)
        Start-Sleep -Milliseconds $HoldMilliseconds
        if ($PauseAfter) {
            [ArcanaGodotInput]::keybd_event(32,0,0,[UIntPtr]::Zero)
            [ArcanaGodotInput]::keybd_event(32,0,2,[UIntPtr]::Zero)
        }
    } finally { [ArcanaGodotInput]::keybd_event($virtualKey,0,2,[UIntPtr]::Zero) }
    Write-Output "Godot $Action for $HoldMilliseconds ms"
    exit
}
$count = if ($Action -eq 'DoubleClick') { 2 } else { $Repeat }
for ($i=0;$i -lt $count;$i++) {
    if ($Action -eq 'WheelUp' -or $Action -eq 'WheelDown') {
        $wheel = if ($Action -eq 'WheelUp') { [uint32]120 } else { [uint32]4294967176 }
        [ArcanaGodotInput]::mouse_event(2048,0,0,$wheel,[UIntPtr]::Zero)
    } else {
        [ArcanaGodotInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
        [ArcanaGodotInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
    }
    Start-Sleep -Milliseconds 70
}
Write-Output "Godot $Action at window pixel ($X, $Y)"

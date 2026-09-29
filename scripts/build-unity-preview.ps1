param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath,

    [string]$EditorPath = 'C:\Program Files\Unity\Hub\Editor\6000.6.3f1\Editor\Unity.exe'
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$projectRoot = (Resolve-Path -LiteralPath $ProjectPath).Path
$editor = (Resolve-Path -LiteralPath $EditorPath).Path
$playbackEngines = Join-Path (Split-Path $editor -Parent) 'Data\PlaybackEngines\WebGLSupport'

foreach ($folder in @('Assets', 'Packages', 'ProjectSettings')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $folder) -PathType Container)) {
        throw "Unity project is missing $folder`: $projectRoot"
    }
}
if (-not (Test-Path -LiteralPath $playbackEngines -PathType Container)) {
    throw "WebGL Build Support is not installed for $editor"
}

$stageRoot = Join-Path $repoRoot '.tmp-unity-webgl'
$stage = Join-Path $stageRoot ([guid]::NewGuid().ToString('N'))
$buildOutput = Join-Path $stage 'output'
$publishedOutput = Join-Path $repoRoot 'assets\unity-preview'

function Assert-WorkspacePath([string]$candidate) {
    $full = [IO.Path]::GetFullPath($candidate)
    if (-not $full.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the repository: $full"
    }
    return $full
}

$stage = Assert-WorkspacePath $stage
$buildOutput = Assert-WorkspacePath $buildOutput
$publishedOutput = Assert-WorkspacePath $publishedOutput
New-Item -ItemType Directory -Path $stage -Force | Out-Null
foreach ($folder in @('Assets', 'Packages', 'ProjectSettings')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $folder) -Destination $stage -Recurse -Force
}

# Keep the preview small enough to load on a mobile connection.
$settingsPath = Join-Path $stage 'ProjectSettings\ProjectSettings.asset'
$settings = Get-Content -LiteralPath $settingsPath -Raw
if ($settings -notmatch 'webGLCompressionFormat: \d+') {
    throw "Unity project has no WebGL compression setting: $settingsPath"
}
$settings = $settings -replace 'webGLCompressionFormat: \d+', 'webGLCompressionFormat: 0'
Set-Content -LiteralPath $settingsPath -Value $settings -Encoding utf8

$editorScriptDirectory = Join-Path $stage 'Assets\Editor'
New-Item -ItemType Directory -Path $editorScriptDirectory -Force | Out-Null
$editorScript = @'
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;

public static class CodexWebPreviewBuild
{
    public static void Build()
    {
        var output = Environment.GetEnvironmentVariable("UNITY_WEBGL_OUTPUT");
        if (string.IsNullOrWhiteSpace(output)) throw new Exception("UNITY_WEBGL_OUTPUT is required");
        var scenes = EditorBuildSettings.scenes.Where(scene => scene.enabled).Select(scene => scene.path).ToArray();
        if (scenes.Length == 0) throw new Exception("No enabled scenes in Editor Build Settings");
        Directory.CreateDirectory(output);
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
            scenes = scenes,
            locationPathName = output,
            target = BuildTarget.WebGL,
            options = BuildOptions.None
        });
        if (report.summary.result != BuildResult.Succeeded)
            throw new Exception("WebGL build failed: " + report.summary.result);
    }
}
'@
Set-Content -LiteralPath (Join-Path $editorScriptDirectory 'CodexWebPreviewBuild.cs') -Value $editorScript -Encoding utf8

$logPath = Join-Path $stage 'build.log'
$previousOutput = $env:UNITY_WEBGL_OUTPUT
try {
    $env:UNITY_WEBGL_OUTPUT = $buildOutput
    $unityProcess = Start-Process -FilePath $editor -ArgumentList @(
        '-batchmode', '-nographics', '-quit', '-accept-apiupdate',
        '-projectPath', "`"$stage`"",
        '-buildTarget', 'WebGL',
        '-executeMethod', 'CodexWebPreviewBuild.Build',
        '-logFile', "`"$logPath`""
    ) -Wait -PassThru -WindowStyle Hidden
    if ($unityProcess.ExitCode -ne 0) {
        throw "Unity exited with code $($unityProcess.ExitCode). See $logPath"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $buildOutput 'index.html') -PathType Leaf)) {
        throw "Unity did not produce index.html. See $logPath"
    }

    $htmlPath = Join-Path $buildOutput 'index.html'
    $html = Get-Content -LiteralPath $htmlPath -Raw
    if ($html -notmatch '(?i)<head>') {
        throw "Unity preview has no HTML head: $htmlPath"
    }
    $responsiveHead = @'
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="unity-preview-responsive.css">
'@
    $html = $html -replace '(?i)<head>', "<head>`n$responsiveHead"
    $loaderMarker = '      var script = document.createElement("script");'
    if (-not $html.Contains($loaderMarker)) {
        throw "Unity preview loader was not found: $htmlPath"
    }
    $html = $html.Replace($loaderMarker, "      config.devicePixelRatio = 1;`n$loaderMarker")
    Set-Content -LiteralPath $htmlPath -Value $html -Encoding utf8
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'unity-preview-responsive.css') -Destination $buildOutput

    if (Test-Path -LiteralPath $publishedOutput) {
        Remove-Item -LiteralPath $publishedOutput -Recurse -Force
    }
    Move-Item -LiteralPath $buildOutput -Destination $publishedOutput
    Write-Output "Unity preview ready: $publishedOutput"
    Remove-Item -LiteralPath $stage -Recurse -Force
}
finally {
    $env:UNITY_WEBGL_OUTPUT = $previousOutput
}

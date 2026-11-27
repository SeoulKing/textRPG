"""Prepare a checksummed official Blender 5.3 portable inside this project."""
from pathlib import Path
import hashlib, json, re, urllib.request, zipfile
ROOT = Path(__file__).resolve().parents[1]
SERIES = "5.3"
BASE = f"https://download.blender.org/release/Blender{SERIES}/"
DEST = ROOT / ".runtime" / "blender"

def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()

def main():
    DEST.mkdir(parents=True, exist_ok=True)
    manifest = DEST / "runtime.json"
    if manifest.exists():
        prior = json.loads(manifest.read_text())
        if prior["version"].startswith(f"{SERIES}.") and (ROOT / prior["executable"]).is_file():
            print("Blender ready:", prior["executable"], flush=True)
            return
    page = fetch(BASE).decode()
    patches = re.findall(rf"blender-{re.escape(SERIES)}\.(\d+)-windows-x64\.zip", page)
    if not patches:
        raise RuntimeError(f"No official Blender {SERIES} Windows x64 ZIP found")
    version = f"{SERIES}.{max(map(int, patches))}"
    name = f"blender-{version}-windows-x64.zip"
    sums = fetch(BASE + f"blender-{version}.sha256").decode()
    matches = [line.split()[0] for line in sums.splitlines() if line.rstrip().endswith(name)]
    if len(matches) != 1: raise RuntimeError("Official checksum missing")
    expected = matches[0].lower()
    archive = DEST / name
    download = archive
    if not archive.is_file():
        download = archive.with_suffix(".zip.part")
        print("Downloading", name, flush=True)
        with urllib.request.urlopen(BASE + name, timeout=60) as response, download.open("wb") as output:
            total = int(response.headers.get("Content-Length", 0))
            done = 0
            milestone = 0
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
                done += len(chunk)
                if done // (32 * 1024 * 1024) > milestone:
                    milestone = done // (32 * 1024 * 1024)
                    print(f"Downloaded {done//1048576} / {total//1048576} MiB", flush=True)
    with download.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    if digest != expected: raise RuntimeError("SHA-256 mismatch; archive was not executed or extracted")
    if download != archive:
        download.replace(archive)
    print("Official SHA-256 verified; extracting portable runtime", flush=True)
    with zipfile.ZipFile(archive) as bundle:
        for entry in bundle.infolist():
            if not (DEST / entry.filename).resolve().is_relative_to(DEST.resolve()):
                raise RuntimeError("Unsafe archive path")
        bundle.extractall(DEST)
    executable = DEST / name.removesuffix(".zip") / "blender.exe"
    if not executable.is_file(): raise RuntimeError("Portable executable missing")
    pending_manifest = manifest.with_suffix(".json.tmp")
    pending_manifest.write_text(json.dumps({"version":version,"source":BASE+name,"sha256":digest,"executable":executable.relative_to(ROOT).as_posix()},indent=2)+"\n", encoding="utf-8")
    pending_manifest.replace(manifest)
    print("Blender ready:", executable.relative_to(ROOT), flush=True)

if __name__ == "__main__": main()

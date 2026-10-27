"""Fetch the pinned Godot editor and only the Web release export template."""
from pathlib import Path
import urllib.request, struct, zlib, zipfile
ROOT = Path(__file__).resolve().parents[1] / '.runtime' / 'godot'
ROOT.mkdir(parents=True, exist_ok=True)
BASE = 'https://github.com/godotengine/godot-builds/releases/download/4.5.1-stable/'
editor = ROOT / 'editor.zip'
if not editor.exists():
    urllib.request.urlretrieve(BASE + 'Godot_v4.5.1-stable_win64.exe.zip', editor)
if not list(ROOT.glob('*console.exe')):
    with zipfile.ZipFile(editor) as archive: archive.extractall(ROOT)
web = ROOT / 'web_nothreads_release.zip'
if not web.exists():
    req = urllib.request.Request(BASE + 'Godot_v4.5.1-stable_export_templates.tpz', method='HEAD', headers={'User-Agent':'Arcana-build'})
    with urllib.request.urlopen(req, timeout=45) as response:
        url = response.url
        total = int(response.headers['Content-Length'])
    def read_range(start, end=None):
        value = f'bytes={start}-{end}' if end is not None else f'bytes={start}'
        req = urllib.request.Request(url, headers={'Range':value, 'User-Agent':'Arcana-build'})
        with urllib.request.urlopen(req, timeout=120) as response:
            if response.status != 206: raise RuntimeError(f'Expected range response, got {response.status}')
            return response.read()
    tail = read_range(total - 65536, total - 1)
    eocd = tail.rfind(b'PK\x05\x06')
    _, _, _, _, _, size, offset, _ = struct.unpack_from('<4s4H2LH', tail, eocd)
    central = read_range(offset, offset + size - 1)
    cursor = 0
    while central[cursor:cursor+4] == b'PK\x01\x02':
        entry = struct.unpack_from('<4s6H3L5H2L', central, cursor)
        method, crc, packed_size, raw_size = entry[4], entry[7], entry[8], entry[9]
        name_size, extra_size, comment_size, local_offset = entry[10], entry[11], entry[12], entry[16]
        name = central[cursor+46:cursor+46+name_size].decode()
        if name == 'templates/web_nothreads_release.zip':
            local = read_range(local_offset, local_offset+29)
            local_name, local_extra = struct.unpack_from('<HH', local, 26)
            begin = local_offset + 30 + local_name + local_extra
            payload = read_range(begin, begin + packed_size - 1)
            data = zlib.decompress(payload, -15) if method == 8 else payload
            if len(data) != raw_size or zlib.crc32(data) != crc: raise RuntimeError('Template checksum mismatch')
            web.write_bytes(data)
            print(f'Web template: {len(data)//1024//1024} MiB; CRC verified')
            break
        cursor += 46 + name_size + extra_size + comment_size
    else: raise RuntimeError('Web template not found')
print('Godot tools ready:', ROOT)

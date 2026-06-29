"""Generate simple PNG icons for the PWA."""

import struct
import zlib
import os


def png(size, bg=(47, 80, 97), fg=(255, 255, 255)):
    w = h = size
    raw = []
    cx, cy = w // 2, h // 2
    r = int(w * 0.28)
    for y in range(h):
        row = [0]
        for x in range(w):
            dx, dy = x - cx, y - cy
            if dx * dx + dy * dy <= r * r:
                row += list(fg) + [255]
            else:
                row += list(bg) + [255]
        raw.append(bytes(row))

    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + name + data + struct.pack(">I", c)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    idat_data = b"".join(zlib.compress(r) for r in raw)
    # Use single compress
    idat_data = zlib.compress(b"".join(raw))

    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", ihdr)
    out += chunk(b"IDAT", idat_data)
    out += chunk(b"IEND", b"")
    return out


os.makedirs("web/icons", exist_ok=True)
for size in (192, 512):
    with open(f"web/icons/icon-{size}.png", "wb") as f:
        f.write(png(size))
print("Icons created.")

#!/usr/bin/env python3
"""Optimise deployment artwork before Vite hashes assets. Run on a fresh checkout."""
import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image


def encode(source):
    with Image.open(io.BytesIO(source)) as image:
        if getattr(image, "is_animated", False):
            return source, image.size, "animated: retained"
        image.load()
        original = image.convert("RGBA")
        output = io.BytesIO()
        metadata = {key: image.info[key] for key in ("icc_profile", "exif") if image.info.get(key)}
        if image.format == "WEBP":
            original.save(output, "WEBP", quality=86, method=6, exact=True, **metadata)
        elif image.format == "PNG":
            image.save(output, "PNG", optimize=True, compress_level=9, **metadata)
        elif image.format == "JPEG":
            image.convert("RGB").save(
                output, "JPEG", quality=88, subsampling=0, optimize=True, progressive=True, **metadata
            )
        else:
            return source, image.size, "retained"
        candidate = output.getvalue()
        # Keep already compact files instead of degrading them for negligible savings.
        threshold = 1 if image.format == "PNG" else 0.9
        if len(candidate) >= len(source) * threshold:
            return source, image.size, "already compact"
        with Image.open(io.BytesIO(candidate)) as check:
            decoded = check.convert("RGBA")
            if decoded.size != original.size:
                raise ValueError("Image dimensions changed")
            if decoded.getchannel("A").tobytes() != original.getchannel("A").tobytes():
                raise ValueError("Image transparency changed")
            if image.format == "PNG" and decoded.tobytes() != original.tobytes():
                raise ValueError("Lossless PNG pixels changed")
        return candidate, image.size, "optimised"


def optimise(roots, report):
    rows = []
    encoded = {}
    for root in roots:
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in {".webp", ".png", ".jpg", ".jpeg"}:
                continue
            source = path.read_bytes()
            digest = hashlib.sha256(source).digest()
            if digest not in encoded:
                encoded[digest] = encode(source)
            output, size, status = encoded[digest]
            if output != source:
                path.write_bytes(output)
            rows.append(dict(path=path.as_posix(), before=len(source), after=len(output),
                             width=size[0], height=size[1], status=status))
    before = sum(row["before"] for row in rows)
    after = sum(row["after"] for row in rows)
    summary = dict(images=len(rows), before=before, after=after,
                   savedPercent=round(100 * (1 - after / before), 1) if before else 0,
                   files=rows)
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(summary, indent=2) + "\n")
    print(f"Images: {len(rows)}; {before:,} -> {after:,} bytes "
          f"({summary['savedPercent']}% smaller)")
    for row in sorted(rows, key=lambda row: row["before"] - row["after"], reverse=True)[:15]:
        print(f"{row['path']}: {row['before']:,} -> {row['after']:,}")
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=Path("public/image-optimization.json"))
    parser.add_argument("roots", type=Path, nargs="*", default=[Path("src"), Path("public"), Path("assets")])
    args = parser.parse_args()
    optimise(args.roots, args.report)

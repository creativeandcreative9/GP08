#!/usr/bin/env python3
"""Extract the licensed asset zip (Shift-JIS filenames) into private-assets/.

Usage: python3 -I tools/extract_assets.py <zip> [outdir]
Default zip:    first *.zip in ../gp08-assets/
Default outdir: private-assets/seisen
"""
import collections
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def decode_name(info: zipfile.ZipInfo) -> str:
    name = info.filename
    if info.flag_bits & 0x800:
        return name
    try:
        return name.encode("cp437").decode("cp932")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name


def main(argv: list) -> int:
    if len(argv) > 1:
        zip_path = argv[1]
    else:
        src_dir = os.path.join(ROOT, "..", "gp08-assets")
        zips = sorted(f for f in os.listdir(src_dir) if f.lower().endswith(".zip")) if os.path.isdir(src_dir) else []
        if not zips:
            print(f"No zip found in {src_dir}. Pass a zip path explicitly.", file=sys.stderr)
            return 1
        zip_path = os.path.join(src_dir, zips[0])
    outdir = os.path.abspath(argv[2] if len(argv) > 2 else os.path.join(ROOT, "private-assets", "seisen"))

    if not os.path.isfile(zip_path):
        print(f"Zip not found: {zip_path}", file=sys.stderr)
        return 1

    entries = []
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            name = decode_name(info).replace("\\", "/")
            parts = [p for p in name.split("/") if p not in ("", ".")]
            if not info.is_dir() and parts:
                entries.append((info, parts))

        # Strip the single top-level folder (only if every file lives under one)
        if entries and all(len(p) > 1 for _, p in entries) and len({p[0] for _, p in entries}) == 1:
            entries = [(i, p[1:]) for i, p in entries]

        counts = collections.Counter()
        pmx = []
        skipped = 0
        os.makedirs(outdir, exist_ok=True)
        for info, parts in entries:
            dest = os.path.abspath(os.path.join(outdir, *parts))
            if dest != outdir and not dest.startswith(outdir + os.sep):
                print(f"SKIP (path traversal): {'/'.join(parts)}", file=sys.stderr)
                skipped += 1
                continue
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with zf.open(info) as src, open(dest, "wb") as dst:
                while True:
                    chunk = src.read(1 << 20)
                    if not chunk:
                        break
                    dst.write(chunk)
            ext = os.path.splitext(dest)[1].lower() or "(none)"
            counts[ext] += 1
            if ext == ".pmx":
                pmx.append(os.path.relpath(dest, outdir))

    print(f"Extracted {sum(counts.values())} files from {zip_path}")
    print(f"  -> {outdir}")
    for ext, n in sorted(counts.items()):
        print(f"  {ext}: {n}")
    if skipped:
        print(f"  skipped: {skipped}")
    print(".pmx files:")
    for p in sorted(pmx):
        print(f"  {p}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

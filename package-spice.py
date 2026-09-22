#!/usr/bin/env python3
"""Stage a Cinnamon Spices pull request directory and installable ZIP."""

import argparse
import filecmp
import json
import re
import shutil
import struct
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
LOCAL_UUID = "mousetrail@local"


def png_size(path):
    with path.open("rb") as stream:
        header = stream.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG: {path}")
    return struct.unpack(">II", header[16:24])


def replace_once(text, old, new, name):
    if text.count(old) != 1:
        raise ValueError(f"Expected one {old!r} in {name}")
    return text.replace(old, new)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--author", required=True,
                        help="Your GitHub username, used in info.json and UUID")
    parser.add_argument("--icon-png", required=True, type=Path,
                        help="Square PNG shown in Cinnamon's applet selection window")
    parser.add_argument("--screenshot", required=True, type=Path,
                        help="Real screenshot for the Spices website")
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / "spice",
                        help="Empty output directory (default: dist/spice)")
    args = parser.parse_args()

    author = args.author
    if (len(author) > 39 or
            not re.fullmatch(r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*", author)):
        parser.error("--author must be a valid GitHub username")
    uuid = f"mousetrail@{author}"

    license_path = ROOT / "LICENSE"
    for path in (args.icon_png, args.screenshot, license_path):
        if not path.is_file():
            parser.error(f"File not found: {path}")
    width, height = png_size(args.icon_png)
    if width != height or width == 0:
        parser.error("--icon-png must be a nonempty square PNG")
    png_size(args.screenshot)
    if not license_path.read_text(encoding="utf-8").strip():
        parser.error("Project LICENSE must contain license text")

    output = args.output.resolve()
    spice_root = output / uuid
    zip_path = output / f"{uuid}.zip"
    if spice_root.exists() or zip_path.exists():
        parser.error(f"Output already exists in {output}; choose a new --output")
    applet_dir = spice_root / "files" / uuid
    applet_dir.mkdir(parents=True)

    (spice_root / "info.json").write_text(
        json.dumps({"author": author}, indent=4) + "\n", encoding="utf-8")
    shutil.copy2(args.screenshot, spice_root / "screenshot.png")
    shutil.copy2(license_path, spice_root / "LICENSE")
    shutil.copy2(ROOT / "SPICES_README.md", spice_root / "README.md")

    shutil.copy2(ROOT / "mousetrail.py", applet_dir / "mousetrail.py")
    shutil.copy2(ROOT / "cinnamon-applet" / LOCAL_UUID / "settings-schema.json",
                 applet_dir / "settings-schema.json")
    shutil.copytree(ROOT / "cinnamon-applet" / LOCAL_UUID / "icons",
                    applet_dir / "icons")
    shutil.copy2(args.icon_png, applet_dir / "icon.png")
    shutil.copy2(license_path, applet_dir / "LICENSE")
    bundled_chooser = ROOT / "chooser-icon.png"
    if (bundled_chooser.is_file() and
            filecmp.cmp(args.icon_png, bundled_chooser, shallow=False)):
        credit = ROOT / "CHOOSER_ICON_CREDIT.md"
        shutil.copy2(credit, spice_root / credit.name)
        shutil.copy2(credit, applet_dir / credit.name)

    metadata = json.loads((ROOT / "cinnamon-applet" / LOCAL_UUID /
                           "metadata.json").read_text(encoding="utf-8"))
    metadata["uuid"] = uuid
    metadata.pop("icon", None)  # Forbidden by the Cinnamon Spices validator.
    (applet_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=4) + "\n", encoding="utf-8")

    applet_js = (ROOT / "cinnamon-applet" / LOCAL_UUID /
                 "applet.js").read_text(encoding="utf-8")
    applet_js = replace_once(applet_js, f'const UUID = "{LOCAL_UUID}";',
                             f'const UUID = "{uuid}";', "applet.js")
    (applet_dir / "applet.js").write_text(applet_js, encoding="utf-8")

    helper_path = applet_dir / "mousetrail.py"
    helper = helper_path.read_text(encoding="utf-8")
    helper = replace_once(helper, f':{LOCAL_UUID}:%s',
                          f':{uuid}:%s', "mousetrail.py")
    helper_path.write_text(helper, encoding="utf-8")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(applet_dir.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(spice_root / "files"))

    print(f"Spices PR directory: {spice_root}")
    print(f"Installable ZIP:      {zip_path}")
    print(f"Validate in the cinnamon-spices-applets checkout with:")
    print(f"  ./validate-spice {uuid}")


if __name__ == "__main__":
    main()

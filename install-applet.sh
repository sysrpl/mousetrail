#!/bin/sh
set -eu

source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target_dir="${XDG_DATA_HOME:-$HOME/.local/share}/cinnamon/applets/mousetrail@local"

mkdir -p "$target_dir/icons"
cp "$source_dir/mousetrail.py" "$target_dir/mousetrail.py"
cp "$source_dir/cinnamon-applet/mousetrail@local/applet.js" "$target_dir/applet.js"
cp "$source_dir/cinnamon-applet/mousetrail@local/metadata.json" "$target_dir/metadata.json"
cp "$source_dir/cinnamon-applet/mousetrail@local/settings-schema.json" "$target_dir/settings-schema.json"
cp "$source_dir"/cinnamon-applet/mousetrail@local/icons/*.svg "$target_dir/icons/"

printf 'Installed Mouse Trail applet in %s\n' "$target_dir"
printf 'Add it through Cinnamon Settings > Applets.\n'

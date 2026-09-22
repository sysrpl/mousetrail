# mousetrail

A screen recording overlay for Linux/X11. It highlights your mouse and your
typing so viewers can follow what you are doing.

* A translucent white circle follows the pointer everywhere.
* Clicking turns the circle into a hollow ring that swells out and eases back.
* Keys you press appear as large key caps along the bottom of the screen:
  typing `About` shows `[A][b][o][u][t]`.

The overlay is click through. It never intercepts a click or a keystroke, so
you work normally while it is running.

## Running

```bash
python3 mousetrail.py
```

Press `Ctrl+C` in that terminal to stop it.

Press `` ` `` (backtick) at any time to hide or show the overlay while it keeps
running. The backtick is not drawn as a key cap. Shift plus backtick still
types a normal `~` and shows as a cap.

## Cinnamon panel applet

Run `sh install-applet.sh`, then open Cinnamon Settings > Applets and add
**Mouse Trail** to the panel. The applet starts the overlay when Cinnamon loads
it. Clicking the panel icon opens Cinnamon's configuration window;
right clicking also offers **Configure…**. The panel icon and its tooltip
("Mouse Trail active" or "Mouse Trail hidden") follow the overlay's
visibility, using separate active and inactive symbols.

The backtick/tilde key still toggles visibility. You can change that hotkey
in the applet's **Behavior** settings, alongside the mouse and keystroke
appearance settings. Changes take effect while the overlay is running.

If you already run `mousetrail.py` from a terminal or session autostart, stop
that copy before adding the applet so only one overlay is displayed.

## Publishing to Cinnamon Spices

The local UUID, `mousetrail@local`, is for development. For a Spices submission,
use your GitHub username as the UUID suffix and provide a real screenshot and a
square PNG for the applet selection window. The project's MIT `LICENSE` is
included automatically.
Do not use an image you do not have rights to redistribute.

```bash
python3 package-spice.py \
  --author YOUR_GITHUB_USERNAME \
  --icon-png chooser-icon.png \
  --screenshot screenshot.png
```

This creates `dist/spice/mousetrail@YOUR_GITHUB_USERNAME/` for a pull request
and `dist/spice/mousetrail@YOUR_GITHUB_USERNAME.zip` for manual installation.
Copy the directory into a fork of
[linuxmint/cinnamon-spices-applets](https://github.com/linuxmint/cinnamon-spices-applets),
run its `./validate-spice mousetrail@YOUR_GITHUB_USERNAME` command, and open a
pull request containing this one applet. The packaging command adjusts the
UUID in the applet and Python helper, and removes the local `metadata.json`
icon field because the Spices validator requires `icon.png` instead.

## Project files

| Path | Purpose |
| --- | --- |
| `mousetrail.py` | The overlay itself; runs standalone or as the applet's helper |
| `cinnamon-applet/mousetrail@local/` | Applet source: `applet.js`, `metadata.json`, `settings-schema.json`, panel icons |
| `active.svg`, `inactive.svg` | Editable panel icon sources; copy them into the applet's `icons/` as `mousetrail-active-symbolic.svg` and `mousetrail-inactive-symbolic.svg` |
| `install-applet.sh` | Installs the local applet into `~/.local/share/cinnamon/applets/` |
| `package-spice.py` | Builds the Spices submission and ZIP in `dist/spice/` |
| `SPICES_README.md` | README shipped with the Spices submission |
| `chooser-icon.png`, `CHOOSER_ICON_CREDIT.md` | Applet selection icon and its license credit |
| `screenshot.png` | Screenshot for the Spices website |

`dist/` and `__pycache__/` are generated and can be deleted at any time.
`package-spice.py` refuses to overwrite an existing output directory, so remove
`dist/spice/` (or pass a new `--output`) before rebuilding.

## Requirements

Already present on a stock Linux Mint install, so there is nothing to `pip install`:

* X11 (a Wayland session will not work, because this uses the X RECORD extension)
* Python 3, GTK 3 via PyGObject (`python3-gi`)
* `python3-xlib`
* A running compositor, for the transparent overlay window

## Tuning

Every knob is a constant at the top of `mousetrail.py`.

### Cursor circle

| Constant | Default | Meaning |
| --- | --- | --- |
| `IDLE_DIAMETER` | `75` | Resting filled circle, in px |
| `CLICK_DIAMETER` | `125` | Peak width of the click ring |
| `STROKE` | `5` | Ring thickness while clicking |
| `OPACITY` | `0.30` | 30% visible |
| `COLOR` | white | RGB, each channel 0 to 1 |
| `CLICK_DURATION` | `0.5` | Seconds the click flash lasts |

### Keystroke display

| Constant | Default | Meaning |
| --- | --- | --- |
| `KEY_DURATION` | `2.0` | Seconds each cap stays on screen |
| `KEY_FADE` | `0.12` | Seconds of fade out at the end of that life |
| `KEY_FONT_SIZE` | `44` | Cap text size in px |
| `KEY_BOTTOM_MARGIN` | `70` | Px above the bottom of the primary monitor |
| `KEY_CORNER` | `10` | Corner radius of a cap; `0` for square |
| `KEY_BG` | black, `0.70` | Cap background, RGBA |
| `KEY_FG` / `KEY_BORDER` | white | Cap text and outline |
| `MAX_KEYS` | `24` | Most caps kept on screen at once |

### Behaviour

| Constant | Default | Meaning |
| --- | --- | --- |
| `FPS` | `60` | Redraw rate |
| `IGNORE_SCROLL` | `True` | Wheel scrolling does not flash the circle |
| `SHOW_KEYS` | `True` | `False` gives a mouse only overlay |
| `TOGGLE_KEY` | `"grave"` | Show/hide key, as an X keysym name |

Special keys are labelled from the `SPECIAL_KEYS` table: `ENTER`, `SPACE`,
`BKSP`, `TAB`, `ESC`, `CTRL`, `ALT`, `SUPER`, `SHIFT`, `CAPS`, `DEL`, `HOME`,
`END`, `PGUP`, `PGDN`, `F1` through `F12`, and arrows as `↑ ↓ ← →`. Edit that dict to
relabel any of them. Modifier keys emit their own press events, so `Ctrl+C`
shows `[CTRL][c]`.

## Notes

* **Passwords are visible.** Every keystroke is drawn on screen. Press
  `` ` `` to hide the overlay before typing anything sensitive on a recording.
* **The toggle key still reaches your apps.** The overlay watches input rather
  than grabbing it, which is what keeps it click through. So pressing `` ` ``
  also types a backtick into whatever has focus, and a backtick you type on
  purpose toggles the overlay. If that gets in the way, set `TOGGLE_KEY` to
  `"Scroll_Lock"` or `"Pause"`, since almost nothing else binds those.
* **Held keys show once.** Autorepeat is suppressed, so holding Backspace
  produces one `[BKSP]` cap rather than a stream of them.
* **Multiple monitors:** the window spans the whole desktop; caps are centered on
  the primary monitor. Resolution and monitor changes are picked up live.

## How it works

One full screen, transparent, always on top window covers the desktop and
never moves; only its contents do. Each frame repaints just the small patch
around the cursor plus the key cap strip when it changes. Moving a small
window every frame instead is what makes this kind of overlay flicker under a
compositor.

The click through behavior comes from an empty input region set on the GTK widget, which
GTK reapplies across realize and resize, so the overlay cannot start
swallowing clicks.

Global clicks and keystrokes are read through the X RECORD extension on a
second X connection in a background thread, which sees input regardless of
which window has focus.

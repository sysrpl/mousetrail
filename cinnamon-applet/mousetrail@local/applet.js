const Applet = imports.ui.applet;
const Settings = imports.ui.settings;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

const UUID = "mousetrail@local";

class MouseTrailApplet extends Applet.IconApplet {
    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);

        this.settings = new Settings.AppletSettings(this, UUID, instanceId);
        this._iconDirectory = GLib.build_filenamev([metadata.path, "icons"]);
        this._statusPath = GLib.build_filenamev([
            GLib.get_user_runtime_dir(), "mousetrail-" + instanceId + ".status"
        ]);
        // The running overlay's process id, so a reloaded applet can find it again.
        this._pidPath = GLib.build_filenamev([
            GLib.get_user_runtime_dir(), "mousetrail-" + instanceId + ".pid"
        ]);
        // Ask Cinnamon which settings file it uses: newer versions keep it
        // in ~/.config/cinnamon/spices, older ones in ~/.cinnamon/configs.
        this._configPath = this.settings.file.get_path();
        this._state = null;
        this._process = null;
        this._adoptedPid = 0;
        this._appletPath = metadata.path;
        this._running = false;
        this._removed = false;
        this._reloading = false;
        this._restartTimer = 0;
        this._reading = false;
        this._cancellable = new Gio.Cancellable();
        this.set_applet_tooltip("Mouse trail visual indicator");

        // The overlay owns the visibility hotkey. Clicking this icon opens
        // Cinnamon's configuration window; it never toggles the overlay.
        this._startOverlay(metadata.path);
        this._refresh();
        this._timer = Mainloop.timeout_add(250, () => this._refresh());
    }

    _startOverlay(appletPath) {
        if (this._removed)
            return;

        // Cinnamon reloads the applet whenever its place on the panel
        // changes, and the reload leaves the overlay running (see
        // on_applet_reloaded). Take that overlay over instead of starting
        // another, so it carries on as it was, hidden or shown.
        let pid = this._runningOverlayPid();
        if (pid) {
            this._adoptedPid = pid;
            this._running = true;
            return;
        }

        GLib.unlink(this._statusPath);
        try {
            this._process = Gio.Subprocess.new([
                "python3",
                GLib.build_filenamev([appletPath, "mousetrail.py"]),
                "--config", this._configPath,
                "--status", this._statusPath,
                "--instance-id", String(this.instance_id)
            ], Gio.SubprocessFlags.NONE);
            this._running = true;
            GLib.file_set_contents(this._pidPath, this._process.get_identifier());
            this._process.wait_async(null, (process, result) => {
                try {
                    process.wait_finish(result);
                } catch (error) {
                    global.logError(error);
                }
                this._running = false;
                this._process = null;
                if (!this._removed) {
                    this._refresh();
                    this._scheduleRestart(appletPath);
                }
            });
        } catch (error) {
            global.logError(error);
            this._scheduleRestart(appletPath);
        }
    }

    /** The overlay this applet instance left running, or 0 if there is none. */
    _runningOverlayPid() {
        let pid = 0;
        try {
            let [ok, contents] = GLib.file_get_contents(this._pidPath);
            if (ok)
                pid = parseInt(this._text(contents).trim());
        } catch (error) {
            // No pid file: look through the running processes below.
        }
        if (pid > 0 && this._isOverlay(pid))
            return pid;

        // An overlay started without a pid file (by an older version of this
        // applet, say) is still this instance's: find it by its command line.
        try {
            let proc = GLib.Dir.open("/proc", 0);
            let name;
            while ((name = proc.read_name()) !== null) {
                if (/^[0-9]+$/.test(name) && this._isOverlay(parseInt(name))) {
                    proc.close();
                    GLib.file_set_contents(this._pidPath, name);
                    return parseInt(name);
                }
            }
            proc.close();
        } catch (error) {
            global.logError(error);
        }
        return 0;
    }

    /** Whether process <pid> is this applet instance's overlay. */
    _isOverlay(pid) {
        try {
            let [ok, contents] = GLib.file_get_contents("/proc/" + pid + "/cmdline");
            let args = ok ? this._text(contents).split("\0") : [];
            let id = args.indexOf("--instance-id");
            return args.some(arg => arg.endsWith("mousetrail.py")) &&
                id >= 0 && args[id + 1] === String(this.instance_id);
        } catch (error) {
            return false;   // the process has gone
        }
    }

    _text(bytes) {
        let value = "";
        for (let i = 0; i < bytes.length; i++)
            value += String.fromCharCode(bytes[i]);
        return value;
    }

    _scheduleRestart(appletPath) {
        if (this._removed || this._restartTimer)
            return;
        this._restartTimer = Mainloop.timeout_add_seconds(2, () => {
            this._restartTimer = 0;
            this._startOverlay(appletPath);
            return false;
        });
    }

    _setStyle() {
        super._setStyle();
        // Keep the SVG symbolic for theme recoloring, but give it the same
        // panel size and spacing as the neighboring applet icons.
        if (this._applet_icon) {
            this._applet_icon.set_style_class_name("applet-icon");
            let size = this.getPanelIconSize(St.IconType.FULLCOLOR);
            if (size)
                this._applet_icon.set_icon_size(size);
        }
    }

    _refresh() {
        // An overlay taken over from before a reload isn't a child of this
        // applet, so there's no exit to wait for: check it's still there.
        if (this._adoptedPid && !GLib.file_test("/proc/" + this._adoptedPid, GLib.FileTest.EXISTS)) {
            this._adoptedPid = 0;
            this._running = false;
            this._scheduleRestart(this._appletPath);
        }
        if (!this._running) {
            this._setState("inactive");
            return true;
        }
        // Skip this tick if the previous read has not finished yet.
        if (this._reading)
            return true;
        this._reading = true;
        let file = Gio.File.new_for_path(this._statusPath);
        file.load_contents_async(this._cancellable, (source, result) => {
            this._reading = false;
            let state = "inactive";
            try {
                let [ok, contents] = source.load_contents_finish(result);
                if (ok) {
                    let value = "";
                    for (let i = 0; i < contents.length; i++)
                        value += String.fromCharCode(contents[i]);
                    if (value.trim() === "active")
                        state = "active";
                }
            } catch (error) {
                // The helper may not have written its first status yet,
                // or the read was cancelled because the applet was removed.
            }
            if (!this._removed && this._running)
                this._setState(state);
        });
        return true;
    }

    _setState(state) {
        if (state !== this._state) {
            this._state = state;
            this.set_applet_tooltip(state === "active"
                ? "Mouse Trail active" : "Mouse Trail hidden");
            this.set_applet_icon_symbolic_path(GLib.build_filenamev([
                this._iconDirectory, "mousetrail-" + state + "-symbolic.svg"
            ]));
        }
    }

    on_applet_clicked() {
        this.configureApplet();
    }

    /** Cinnamon calls this just before removing the applet to load it again. */
    on_applet_reloaded() {
        this._reloading = true;
    }

    on_applet_removed_from_panel() {
        this._removed = true;
        this._cancellable.cancel();
        Mainloop.source_remove(this._timer);
        if (this._restartTimer)
            Mainloop.source_remove(this._restartTimer);
        // On a reload the overlay keeps running for the new applet to take
        // over; otherwise the applet is really going, and the overlay with it.
        if (this._running && !this._reloading) {
            if (this._process)
                this._process.force_exit();
            else if (this._adoptedPid)
                GLib.spawn_command_line_async("kill " + this._adoptedPid);
            GLib.unlink(this._pidPath);
        }
        this.settings.finalize();
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new MouseTrailApplet(metadata, orientation, panelHeight, instanceId);
}

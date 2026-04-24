# Demo artifacts

The **primary demo** for Claude Colony is an interactive auto-play page, not a video:

→ **[public/demo.html](../public/demo.html)**

Why: it loads in any browser in under a second, plays a scripted 6-act walkthrough with narration and spotlights, and doesn't require hosting a video file. The auto-play includes pause/skip/restart controls.

## Recording a video of the demo

If you want an `mp4` or `gif` (for README embeds, social posts, or conference talks), use the bundled script:

```bash
bash docs/record-demo.sh
```

It will:

1. Start the local server if it's not already running.
2. Open `demo.html` in a Chrome app-mode window (no tabs, no URL bar — clean capture).
3. Record **45 seconds** with ffmpeg (`avfoundation`, macOS).
4. Crop + scale to 1280p, x264 CRF 20, yuv420p — a ~4–6 MB mp4.
5. Optionally generate `docs/demo.gif` for README embed.

Output: `docs/demo.mp4` (and `docs/demo.gif` if you opted in).

### Permissions

macOS requires **Screen Recording** permission for Terminal (or whatever shell you run from):

- System Settings → Privacy & Security → Screen Recording → tick `Terminal` / `iTerm` / etc.
- Restart the terminal after granting.

### Custom crop

If your display is not 1440×900, pass the rect explicitly:

```bash
bash docs/record-demo.sh 2560 1600 0 0
#                        W    H    X Y
```

You can also edit the `-i "2:none"` index in the script — ffmpeg's avfoundation screen index varies (usually 1, 2, or 3). Run once and check its output for the available screen IDs.

### GIF tuning

The gif stage uses a palette optimization for good quality at ~2–4 MB. To shrink:

- Lower fps: `fps=10` instead of `fps=12`
- Lower width: `scale=700:-1` instead of `scale=900:-1`
- Trim duration first: record 30s instead of 45s.

## Linux / Windows

The demo.html artifact works cross-platform in any Chromium or WebKit browser. For recording:

- **Linux**: swap `avfoundation` → `x11grab` (`ffmpeg -f x11grab -i :0.0 ...`)
- **Windows**: use `gdigrab` (`ffmpeg -f gdigrab -i desktop ...`)

Same ffmpeg flags otherwise.

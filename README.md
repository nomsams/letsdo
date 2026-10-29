# Near

[**Open Near →**](https://nomsams.github.io/letsdo/)

Mobile-first video calling for troubleshooting together.

- One-tap call setup, shareable links, and downloadable QR codes.
- Voice, one-way guided camera, two-way video, and screen sharing.
- Drag-to-guide arrows, hold-still and closer prompts, tilt support, and lightweight target tracking.
- Encrypted calls, chat, emojis, files, and a permission-based shared pointer.
- Reconnect recovery, device checks with a private preview, and larger controls in Settings.
- Freeze a shared picture and circle parts while continuing to talk.
- Select an item by tapping it or drawing a box; its marker follows movement locally.
- Connection quality, an audio-only fallback, and camera light control on supported phones.

## Run locally

```sh
npm ci
npm run dev
```

Pushes to `main` deploy automatically to GitHub Pages.

Camera and microphone are optional. Join with either device off and enable it later. Screen sharing depends on browser support. The shared pointer works inside Near; full desktop control requires a native helper. Some networks require a TURN relay, configurable in Settings.

Item tracking works best on a clear, textured detail with slow camera movement. It asks you to select again when the item is lost. Reconnect retries are bounded; closing or reloading a tab ends the session. Torch support depends on the browser and camera.

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

## Live demonstration

1. On the laptop, choose **Guide someone**, then **Start call**.
2. Scan the QR code with the phone and join. Answer on the laptop, then choose devices on both screens.
3. Drag on the laptop video to point; release to ask the camera user to hold still. Try **Come closer** and **Select item**.
4. Use **Freeze & mark**, circle a detail, then **Back to live**. Screen sharing is available directly in the desktop controls.

Desktop shortcuts: **M** microphone, **V** camera, **P** freeze/resume, **F** fullscreen. Shortcuts stay inactive while typing or using a dialog.

Rehearse on the presentation devices and network. A restrictive venue network may require a TURN relay configured before the call.

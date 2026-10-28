# Near

[**Open Near →**](https://nomsams.github.io/letsdo/)

Mobile-first video calling for troubleshooting together.

- Voice, one-way guided camera, two-way video, and screen sharing.
- Drag-to-guide arrows, hold-still and closer prompts, tilt support, and lightweight target tracking.
- Encrypted calls, chat, emojis, files, and a permission-based shared pointer.

## Run locally

```sh
npm ci
npm run dev
```

Pushes to `main` deploy automatically to GitHub Pages.

Camera and microphone require browser permission. Screen sharing depends on browser support. The shared pointer works inside Near; full desktop control requires a native helper. Some networks require a TURN relay, configurable in Settings.

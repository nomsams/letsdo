# Near

A mobile-first, browser-based calling application for helping someone with a task remotely. The two roles are **Guide** and **Camera**. Built with TypeScript, Vite, PeerJS, and native WebRTC; deploys as a static GitHub Pages site.

## Run

Requires Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open the printed localhost URL. The initial screen is a clearly labeled, interactive demonstration; it does not open a microphone, camera, or signaling connection. Chat messages in the demonstration are local previews.

```sh
npm test
npm run build
npm run preview
```

## Make a call

1. Choose **Start a call**, enter a name, and pick a call type.
2. For guided camera, choose **I need a hand** to share your rear camera or **I'm here to help** to guide the other person's camera. The invited person automatically gets the opposite role.
3. Share the invitation privately and keep the host tab open. The second person opens it and chooses to join.
4. The host accepts the incoming request. Both browsers then request the required media permissions. Denial ends the attempt and stops any acquired tracks.
5. The Guide drags on the video to show a direction. Releasing displays **Hold still** on the Camera's screen. **Come closer** requests physical movement; the zoom controls only enlarge your own view.
6. **Lock target** tracks a selected image patch on the Guide's device and sends its position to the Camera. Use distinct details, good light, and slow movement. Tracking clears if confidence drops.
7. Send messages, emoji, or files in Conversation. The receiver must approve each file; transfers are chunked and limited to 10 MB and three pending offers per direction.
8. Either person can share a screen if their browser supports it. The screen owner must explicitly approve a shared pointer. Pointer access can be revoked with **Pointer**; screen-sharing termination also revokes it.
9. **End call** closes media/data connections and stops camera, microphone, and display tracks. Messages stay in the current tab until cleared or closed.

The Camera sees their own outgoing video in guided mode, together with incoming guidance. The Guide sees that same camera stream. Two-way video shows the remote video and a local preview; voice mode uses microphone audio.

## GitHub Pages deployment

The repository includes `.github/workflows/pages.yml` and a relative Vite base, so it works at both a root domain and a project subpath.

1. Put these source files in a GitHub repository on the `main` branch, including `package-lock.json`.
2. In repository **Settings → Pages**, select **GitHub Actions** as the source.
3. Push to `main`, or run **Deploy Near to GitHub Pages** manually from Actions.
4. Open the URL emitted by the deployment job. Invite links use URL fragments, so no server routing or SPA fallback is required.

The deployment target is [nomsams/letsdo](https://github.com/nomsams/letsdo). Select **GitHub Actions** as the publishing source in [Pages settings](https://github.com/nomsams/letsdo/settings/pages) before the first workflow deployment.

## Networking

GitHub Pages only serves the web application. WebRTC also needs signaling and, on some networks, a relay. By default Near uses PeerJS Cloud for signaling and public Google/Cloudflare STUN endpoints. Public services have no availability guarantee.

For restrictive NATs, workplace networks, and reliable production operation, provide a TURN service. Open **Settings → Connection & relay settings** before starting a call and enter a TURN URL, username, and credential. Both participants should configure relay access. The UI also supports a custom HTTPS PeerServer hostname, port, and path.

Relay credentials are stored only in the tab's `sessionStorage`. Do not embed long-lived TURN credentials in a public GitHub Pages bundle. A production deployment should obtain short-lived TURN credentials from an authenticated external service. Hosting and maintaining TURN/PeerServer is outside GitHub Pages.

## Privacy and permissions

- WebRTC media uses mandatory DTLS-SRTP encryption; the data channel uses DTLS. Encryption is always enabled. This is transport encryption between peers, not a separately audited identity-verification or application-level encryption scheme.
- Invite links contain a 256-bit random secret in the fragment. The secret is exchanged only after the encrypted data channel opens, checked by the host, and never placed in signaling metadata. The host still explicitly approves the call. Link holders can request access; share links privately.
- The fragment is removed from the invited browser's current history entry after parsing. The link and peer ID expire when the host closes the session.
- PeerJS and STUN infrastructure see connection metadata; TURN may relay encrypted packets. Peers can learn each other's IP addresses.
- No server-side accounts, call recordings, chat history, uploaded frames, analytics, or cloud file storage are implemented. Name preference is saved in `localStorage`; network settings use `sessionStorage`; messages and file contents remain in tab memory.
- External Google Fonts are used for typography. System fonts remain usable if they cannot load. Replace the CSS import with self-hosted fonts if eliminating this external request is required.
- Ending the call stops captured media. Received file download links persist until the conversation is cleared or the tab is closed. Downloads are explicitly saved by the recipient and are not automatically opened.

## Browser and product limits

- HTTPS is required for media and sensors, except on localhost. Opening a plain LAN HTTP URL on a phone will generally fail media permission checks. Use the GitHub Pages HTTPS URL for real-device testing.
- Screen sharing depends on `getDisplayMedia`; many mobile browsers cannot originate screen capture. Desktop Chrome/Edge are the intended sharing clients. Receiving shared video works through ordinary WebRTC video.
- A web page cannot control the operating-system mouse, click in other apps, or remotely operate arbitrary websites. The implemented, permission-based shared pointer is an overlay inside Near. Full remote desktop control needs a separately installed and consent-based native helper; none is included.
- Arrows are perspective-styled overlays. Optional phone orientation input compensates for tilt and can be recalibrated from Settings. This is **not** world-anchored AR/SLAM or a persistent 3D reconstruction. Sensors vary across browsers and devices.
- The lightweight patch tracker is not YOLO or semantic object recognition. It runs at about six updates per second on downscaled frames, downloads no AI model, and can lose a target after motion, occlusion, rotation, scale changes, or lighting changes. Re-lock manually when needed.
- Preview zoom is digital and local. It does not increase source detail or actuate the remote camera's optical zoom.
- Calls are one-to-one and must be started again after disconnection. Backgrounded mobile browsers may suspend media or sensor events. There is no push calling, offline calling, recording, or multi-party support.
- The implementation is an initial MVP and has not undergone a security audit or a two-device interoperability certification.

## Validation

`npm run build` typechecks all source and emits the static site. `npm test` checks invitation parsing, protocol bounds, aspect-correct coordinates, and file size/chunk integrity. The local server was verified to return HTTP 200. Browser inspection was blocked by the environment's browser/Computer Use infrastructure, so visual review and live two-device media verification remain outstanding.

Recommended acceptance check on HTTPS: one Android Chrome or iPhone Safari Camera and a desktop Chrome Guide; test role reversal, all three modes, permission denial, arrows/hold/closer, tracking loss, phone rotation, screen-share stop, pointer approval/revocation, chat emoji, accepted/declined/interrupted files, end-call cleanup, and two networks with TURN configured.

## Source map

- `src/main.ts`: interface, media permissions, guidance, sensors, messaging, transfers, session lifecycle.
- `src/connection.ts`: authenticated one-to-one data channel, approval, media negotiation, timeouts, cleanup.
- `src/protocol.ts`: input validation, normalized coordinates, invitation parsing, bounded file assembly.
- `src/tracker.ts`: local image patch tracking.
- `src/style.css`: responsive UI, mobile controls, accessibility and reduced-motion rules.
- `public/workshop.svg`: original illustration used by the labeled demonstration.

Protocol references: [PeerJS signaling and TURN](https://peerjs.com/client/faq), [WebRTC data encryption](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels#security), [screen capture](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia), [orientation permission](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static).

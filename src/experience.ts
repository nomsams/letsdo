import { inviteFromHash, type Mode, type Role } from './protocol.ts';

export function mediaNeeds(mode: Mode, role: Role) {
  const camera = mode === 'video' || mode === 'guided' && role === 'camera';
  return { camera, title: camera ? 'Turn on your camera and microphone' : 'Turn on your microphone', description: camera ? 'The other person will see your camera and hear you. Your browser will ask you to allow both.' : 'The other person will hear you. Your camera stays off. Your browser will ask you to allow the microphone.' };
}

export function invitationFromLink(value: string, appUrl: string) {
  try {
    const base = new URL(appUrl), url = new URL(value.trim(), base);
    if (url.origin !== base.origin || url.pathname.replace(/\/$/, '') !== base.pathname.replace(/\/$/, '')) return null;
    return inviteFromHash(url.hash);
  } catch { return null; }
}

export function friendlyProblem(reason: string) {
  if (/older version|update Near/i.test(reason)) return { title: 'Refresh Near on both devices', detail: 'This call was started with an older version. Reload the app on both devices, then create a new call link.' };
  if (/browser.*support|secure context|https/i.test(reason)) return { title: 'Open Near in your browser', detail: 'Open this link in Safari, Chrome, or Edge using https. Camera calling may not work inside a messaging app’s built-in browser.' };
  if (/NotAllowed|permission|denied/i.test(reason)) return { title: 'Camera or microphone blocked', detail: 'Open this site’s permissions in your browser and allow the microphone and camera. Then try again.' };
  if (/NotFound|No microphone|No camera|device.*found/i.test(reason)) return { title: 'We couldn’t find your camera or microphone', detail: 'Check that your device has a microphone and camera. Close other apps that may be using them, then try again.' };
  if (/expired|handshake/i.test(reason)) return { title: 'This invitation is no longer available', detail: 'Ask the other person to start a new call and send you a fresh invitation.' };
  if (/declined/i.test(reason)) return { title: 'The call wasn’t answered', detail: 'They may not be ready yet. You can start another call when it’s a good time.' };
  if (/left the call|Call ended|media call ended/i.test(reason)) return { title: 'Your call has ended', detail: 'Your microphone, camera, and screen sharing are off. You can start another call whenever you like.' };
  return { title: 'We couldn’t keep you connected', detail: 'Check that both devices are online. Try again, or switch from Wi-Fi to mobile data. If the problem continues, ask someone to check Advanced connection settings.' };
}

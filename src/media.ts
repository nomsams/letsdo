export type CaptureRequest = { audio: boolean; video: MediaTrackConstraints | false };
export type CaptureFailure = { kind: 'audio' | 'video'; name: string };

/** Ask for devices independently: a rejected mic must not discard an allowed camera. */
export async function captureDevices(target: MediaStream, request: CaptureRequest, active: () => boolean, devices = navigator.mediaDevices): Promise<CaptureFailure[]> {
  const failures: CaptureFailure[] = [];
  for (const kind of ['audio', 'video'] as const) {
    if (!request[kind] || !active()) continue;
    try {
      if (!devices?.getUserMedia) throw new DOMException('Capture unavailable', 'NotSupportedError');
      const stream = await devices.getUserMedia(kind === 'audio' ? { audio: { echoCancellation: true, noiseSuppression: true }, video: false } : { audio: false, video: request.video });
      if (!active()) { stream.getTracks().forEach(track => track.stop()); continue; }
      stream.getTracks().forEach(track => target.addTrack(track));
    } catch (error) { failures.push({ kind, name: (error as Error).name }); }
  }
  return failures;
}

import type { Packet } from './protocol';

type Callbacks = { send: (packet: Packet) => void; stream: (stream: MediaStream) => void; error: (message: string) => void; status?: (message: string) => void };

/** Media has fixed send/receive slots. Joining and listening never requires a captured track. */
export class MediaTransport {
  readonly pc: RTCPeerConnection;
  readonly remote = new MediaStream();
  private slots?: Record<'audio' | 'video', RTCRtpTransceiver>;
  private candidates: RTCIceCandidateInit[] = [];
  private closed = false;
  private local: MediaStream;
  private callbacks: Callbacks;
  private operations: Promise<void> = Promise.resolve();
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  private recoveryAttempts = 0;
  private videoPaused = false;
  constructor(local: MediaStream, iceServers: RTCIceServer[], callbacks: Callbacks, initiator = true) {
    this.local = local; this.callbacks = callbacks;
    this.pc = new RTCPeerConnection({ iceServers });
    if (initiator) this.slots = {
      audio: this.pc.addTransceiver(local.getAudioTracks()[0] ?? 'audio', { direction: 'sendrecv', streams: [local] }),
      video: this.pc.addTransceiver(local.getVideoTracks()[0] ?? 'video', { direction: 'sendrecv', streams: [local] }),
    };
    this.pc.onicecandidate = event => { if (event.candidate && !this.closed) callbacks.send({ type: 'rtc-ice', candidate: event.candidate.toJSON() }); };
    this.pc.ontrack = event => {
      if (!this.remote.getTracks().includes(event.track)) this.remote.addTrack(event.track);
      event.track.onunmute = event.track.onmute = event.track.onended = () => this.publishStream();
      this.publishStream();
    };
    this.pc.onconnectionstatechange = () => {
      if (this.closed) return;
      if (this.pc.connectionState === 'connected') {
        clearTimeout(this.recoveryTimer); this.recoveryTimer = undefined; this.recoveryAttempts = 0;
        this.publishStream();
      } else if (['disconnected', 'failed'].includes(this.pc.connectionState)) {
        callbacks.status?.('Connection interrupted · trying to reconnect…');
        if (!this.recoveryTimer) this.recoveryTimer = setTimeout(() => this.recover(initiator), this.pc.connectionState === 'failed' ? 0 : 4000);
      }
    };
  }
  private publishStream() { if (!this.closed && this.pc.connectionState === 'connected') this.callbacks.stream(this.remote); }
  private enqueue(operation: () => Promise<void>) {
    const result = this.operations.then(async () => { if (!this.closed) await operation(); }).catch(error => { if (!this.closed) throw error; });
    this.operations = result.catch(() => {});
    return result;
  }
  private recover(initiator: boolean) {
    this.recoveryTimer = undefined;
    if (this.closed || this.pc.connectionState === 'connected') return;
    if (++this.recoveryAttempts > 2) { this.callbacks.error('Media could not reconnect. Try another network or configure a TURN relay in Settings.'); return; }
    if (initiator) void this.offer(true).catch(() => { if (!this.closed) this.callbacks.error('Media could not reconnect. Try a new call.'); });
    this.recoveryTimer = setTimeout(() => this.recover(initiator), 12000);
  }
  offer(iceRestart = false) { return this.enqueue(async () => {
    const offer = await this.pc.createOffer({ iceRestart });
    if (this.closed) return;
    await this.pc.setLocalDescription(offer);
    if (!this.closed) this.callbacks.send({ type: 'rtc-offer', sdp: this.pc.localDescription!.sdp });
  }); }
  signal(packet: Packet) { return this.enqueue(() => this.applySignal(packet)); }
  private async applySignal(packet: Packet) {
    if (this.closed) return;
    if (packet.type === 'rtc-ice') {
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(packet.candidate as RTCIceCandidateInit);
      else if (this.candidates.length < 256) this.candidates.push(packet.candidate as RTCIceCandidateInit);
      return;
    }
    const type = packet.type === 'rtc-offer' ? 'offer' : 'answer';
    await this.pc.setRemoteDescription({ type, sdp: packet.sdp as string });
    if (this.closed) return;
    if (type === 'offer' && !this.slots) {
      const transceivers = this.pc.getTransceivers();
      this.slots = { audio: transceivers.find(t => t.receiver.track.kind === 'audio')!, video: transceivers.find(t => t.receiver.track.kind === 'video')! };
      for (const kind of ['audio', 'video'] as const) {
        const slot = this.slots[kind];
        if (!slot) throw new Error('Missing media slot');
        slot.direction = 'sendrecv';
        slot.sender.setStreams?.(this.local);
        await slot.sender.replaceTrack(kind === 'video' && this.videoPaused ? null : this.local.getTracks().find(t => t.kind === kind) ?? null);
      }
    }
    for (const candidate of this.candidates.splice(0)) { if (this.closed) return; await this.pc.addIceCandidate(candidate); }
    if (type === 'offer') {
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      if (!this.closed) this.callbacks.send({ type: 'rtc-answer', sdp: this.pc.localDescription!.sdp });
    }
  }
  replace(kind: 'audio' | 'video', track: MediaStreamTrack | null) { return this.enqueue(async () => {
    if (this.slots) await this.slots[kind].sender.replaceTrack(kind === 'video' && this.videoPaused ? null : track);
    this.local.getTracks().filter(t => t.kind === kind).forEach(t => this.local.removeTrack(t));
    if (track) this.local.addTrack(track);
  }); }
  pauseVideo(paused: boolean) { return this.enqueue(async () => {
    this.videoPaused = paused;
    if (this.slots) await this.slots.video.sender.replaceTrack(paused ? null : this.local.getVideoTracks()[0] ?? null);
  }); }
  close() {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.recoveryTimer); this.candidates.length = 0;
    this.remote.getTracks().forEach(track => { track.onunmute = track.onmute = track.onended = null; track.stop(); });
    this.pc.onicecandidate = null; this.pc.ontrack = null; this.pc.onconnectionstatechange = null; this.pc.close();
  }
}

import type { Packet } from './protocol';

type Callbacks = { send: (packet: Packet) => void; stream: (stream: MediaStream) => void; error: (message: string) => void };

/** Media has fixed send/receive slots. Joining and listening never requires a captured track. */
export class MediaTransport {
  readonly pc: RTCPeerConnection;
  readonly remote = new MediaStream();
  private slots?: Record<'audio' | 'video', RTCRtpTransceiver>;
  private candidates: RTCIceCandidateInit[] = [];
  private closed = false;
  private local: MediaStream;
  private callbacks: Callbacks;
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
      event.track.onunmute = () => this.publishStream();
      this.publishStream();
    };
    this.pc.onconnectionstatechange = () => {
      if (this.closed) return;
      if (this.pc.connectionState === 'connected') this.publishStream();
      if (this.pc.connectionState === 'failed') callbacks.error('Media could not connect. Try another network or configure a TURN relay in Settings.');
    };
  }
  private publishStream() { if (!this.closed && this.pc.connectionState === 'connected') this.callbacks.stream(this.remote); }
  async offer() {
    await this.pc.setLocalDescription(await this.pc.createOffer());
    if (!this.closed) this.callbacks.send({ type: 'rtc-offer', sdp: this.pc.localDescription!.sdp });
  }
  async signal(packet: Packet) {
    if (this.closed) return;
    if (packet.type === 'rtc-ice') {
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(packet.candidate as RTCIceCandidateInit);
      else if (this.candidates.length < 256) this.candidates.push(packet.candidate as RTCIceCandidateInit);
      return;
    }
    const type = packet.type === 'rtc-offer' ? 'offer' : 'answer';
    await this.pc.setRemoteDescription({ type, sdp: packet.sdp as string });
    if (type === 'offer' && !this.slots) {
      const transceivers = this.pc.getTransceivers();
      this.slots = { audio: transceivers.find(t => t.receiver.track.kind === 'audio')!, video: transceivers.find(t => t.receiver.track.kind === 'video')! };
      for (const kind of ['audio', 'video'] as const) {
        const slot = this.slots[kind];
        if (!slot) throw new Error('Missing media slot');
        slot.direction = 'sendrecv';
        slot.sender.setStreams?.(this.local);
        await slot.sender.replaceTrack(this.local.getTracks().find(t => t.kind === kind) ?? null);
      }
    }
    for (const candidate of this.candidates.splice(0)) await this.pc.addIceCandidate(candidate);
    if (type === 'offer') {
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      if (!this.closed) this.callbacks.send({ type: 'rtc-answer', sdp: this.pc.localDescription!.sdp });
    }
  }
  async replace(kind: 'audio' | 'video', track: MediaStreamTrack | null) {
    if (this.closed) return;
    if (this.slots) await this.slots[kind].sender.replaceTrack(track);
    this.local.getTracks().filter(t => t.kind === kind).forEach(t => this.local.removeTrack(t));
    if (track) this.local.addTrack(track);
  }
  close() { if (this.closed) return; this.closed = true; this.pc.onicecandidate = null; this.pc.ontrack = null; this.pc.onconnectionstatechange = null; this.pc.close(); }
}

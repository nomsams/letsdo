import Peer, { type DataConnection, type MediaConnection } from 'peerjs';
import { type Role, type Mode, type Packet, validPacket, randomToken, createInvitationUrl } from './protocol';
export type SessionConfig = { name: string; role: Role; mode: Mode; iceServers: RTCIceServer[]; signaling?: {host:string;port:number;path:string;secure:boolean} };
type Hooks = { status: (s: string) => void; invite: (url: string) => void; request: (name: string) => void; joined: (name: string, role: Role, mode: Mode) => void; packet: (p: Packet) => void; stream: (s: MediaStream) => void; ended: (reason: string) => void };
export class CallSession {
  peer: Peer;
  data?: DataConnection;
  media?: MediaConnection;
  token: string;
  local?: MediaStream;
  authenticated = false;
  accepted = false;
  private otherReady = false;
  private calling = false;
  private closed = false;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private mediaWaitTimer?: ReturnType<typeof setTimeout>;
  constructor(public config: SessionConfig, private hooks: Hooks, private invitation?: {peer:string;token:string}) {
    this.token = invitation?.token || randomToken();
    this.peer = new Peer({ ...(config.signaling || {}), config: { iceServers: config.iceServers }, debug: 0 });
    hooks.status('Getting your call ready…');
    this.connectTimer = setTimeout(() => this.fail('Connection timed out. Check your network or configure a TURN relay in Settings.'), 45000);
    this.peer.on('open', id => {
      clearTimeout(this.connectTimer);
      if (invitation) this.bindData(this.peer.connect(invitation.peer, { reliable: true, serialization: 'binary' }));
      else {
        const published = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
        hooks.invite(createInvitationUrl(id, this.token, location.href, published)); hooks.status('Waiting for your person');
      }
    });
    this.peer.on('connection', conn => {
      if (invitation || this.data) { conn.on('open', () => conn.close()); return; }
      this.bindData(conn);
    });
    this.peer.on('call', call => {
      if (!this.accepted || !this.local || call.peer !== this.data?.peer || this.media) { call.close(); return; }
      this.bindMedia(call); call.answer(this.local);
    });
    this.peer.on('error', err => this.fail(err.type === 'peer-unavailable' ? 'This invitation has expired. Ask for a new link.' : `Could not connect (${err.type}). Try again or add a TURN relay in Settings.`));
    this.peer.on('disconnected', () => { if (!this.closed) hooks.status('Connection interrupted · keep this page open'); });
  }
  private bindData(conn: DataConnection) {
    this.data = conn;
    const handshake = setTimeout(() => { if (!this.authenticated) {conn.close(); if(this.data===conn)this.data=undefined; if(this.invitation)this.fail('The invitation handshake timed out. Ask for a new link.');} }, 15000);
    conn.on('open', () => {
      if (this.invitation) this.raw({type:'hello',token:this.token,name:this.config.name});
      this.hooks.status('Waiting for an answer');
    });
    conn.on('data', value => {
      if (!validPacket(value)) return;
      const p = value;
      if (p.type === 'hello' && !this.invitation && !this.authenticated) {
        if (p.token !== this.token) {conn.close();return;}
        this.authenticated = true; clearTimeout(handshake);
        this.raw({type:'welcome',name:this.config.name,role:this.config.role,mode:this.config.mode});
        this.hooks.request(String(p.name)); return;
      }
      if (p.type === 'welcome' && this.invitation && !this.authenticated) {
        this.authenticated = true; clearTimeout(handshake);
        this.config.role = p.role === 'guide' ? 'camera' : 'guide'; this.config.mode = p.mode as Mode;
        this.hooks.joined(String(p.name),this.config.role,this.config.mode); return;
      }
      if (!this.authenticated) return;
      if (p.type === 'reject') { this.fail('Call declined.'); return; }
      if (p.type === 'accepted' && this.invitation && !this.accepted) {this.accepted=true;this.hooks.packet(p);return;}
      if (!this.accepted) return;
      if (p.type === 'ready') { this.otherReady=true;this.maybeCall();return; }
      if (p.type === 'end') { this.fail('Your person left the call.');return; }
      if (p.type === 'ping') { this.send({type:'pong'});return; }
      this.hooks.packet(p);
    });
    conn.on('close', () => { clearTimeout(handshake); if (!this.closed && this.authenticated) this.fail('Connection closed. Start a new call to reconnect.'); else if(this.data===conn)this.data=undefined; });
    conn.on('error', () => this.fail('The data connection failed. Try a new call.'));
  }
  accept() { if(this.accepted)return; this.accepted = true; this.send({type:'accepted'}); this.mediaWaitTimer=setTimeout(()=>this.fail('Media setup timed out. Check permissions on both devices and try a new call.'),90000); }
  decline() { this.raw({type:'reject'}); setTimeout(()=>this.close(),150); }
  setStream(stream: MediaStream) { this.local=stream;this.send({type:'ready'});this.maybeCall(); }
  private maybeCall() {
    if (this.invitation || !this.otherReady || !this.local || this.calling || !this.data || !this.accepted) return;
    this.calling = true; this.hooks.status('Connecting your call…');
    this.connectTimer = setTimeout(() => this.fail('Media could not connect. Configure a TURN relay in Settings and try again.'), 35000);
    this.bindMedia(this.peer.call(this.data.peer,this.local));
  }
  private bindMedia(call: MediaConnection) {
    this.media=call;
    call.on('stream', stream => { clearTimeout(this.connectTimer);clearTimeout(this.mediaWaitTimer);this.hooks.status('Connected');this.hooks.stream(stream); });
    call.on('close', () => {if(!this.closed)this.fail('The media call ended.');});
    call.on('error', () => this.fail('Media connection failed. Check your permissions and network.'));
  }
  async replaceVideo(track: MediaStreamTrack) {
    const sender = this.media?.peerConnection.getSenders().find(s => s.track?.kind === 'video');
    if(sender) await sender.replaceTrack(track);
    if(this.local) {this.local.getVideoTracks().forEach(t=>this.local!.removeTrack(t));this.local.addTrack(track);}
  }
  private raw(packet: Packet) {if(this.data?.open)this.data.send(packet);}
  send(packet: Packet) {if(this.authenticated)this.raw(packet);}
  get bufferedAmount() {return this.data?.dataChannel?.bufferedAmount || 0;}
  get connected() {return this.accepted && !!this.data?.open;}
  private fail(reason: string) {if(this.closed)return;this.close();this.hooks.ended(reason);}
  close() {if(this.closed)return;this.send({type:'end'});this.closed=true;clearTimeout(this.connectTimer);clearTimeout(this.mediaWaitTimer);this.local?.getTracks().forEach(t=>t.stop());this.media?.close();this.data?.close();this.peer.destroy();}
}

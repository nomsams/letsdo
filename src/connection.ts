import Peer, { type DataConnection } from 'peerjs';
import { MediaTransport } from './rtc';
import { type Role, type Mode, type Packet, validPacket, randomToken, createInvitationUrl } from './protocol';
export type SessionConfig = { name: string; role: Role; mode: Mode; iceServers: RTCIceServer[]; signaling?: {host:string;port:number;path:string;secure:boolean} };
type Hooks = { status: (s: string) => void; invite: (url: string) => void; request: (name: string) => void; joined: (name: string, role: Role, mode: Mode) => void; packet: (p: Packet) => void; stream: (s: MediaStream) => void; ended: (reason: string) => void };
export class CallSession {
  peer: Peer;
  data?: DataConnection;
  media?: MediaTransport;
  token: string;
  local?: MediaStream;
  authenticated = false;
  accepted = false;
  private otherReady = false;
  private calling = false;
  private closed = false;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private handshakeTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  private opened = false;
  private recovering = false;
  private remotePeer?: string;
  private dataRetryTimer?: ReturnType<typeof setTimeout>;
  private recoveryDeadline?: ReturnType<typeof setTimeout>;
  constructor(public config: SessionConfig, private hooks: Hooks, private invitation?: {peer:string;token:string}) {
    this.token = invitation?.token || randomToken();
    this.peer = new Peer({ ...(config.signaling || {}), config: { iceServers: config.iceServers }, debug: 0 });
    hooks.status('Getting your call ready…');
    this.connectTimer = setTimeout(() => this.fail('Connection timed out. Check your network or configure a TURN relay in Settings.'), 45000);
    this.peer.on('open', id => {
      if (this.closed) return;
      clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; this.reconnectAttempts = 0;
      if (this.opened) { if(this.recovering)this.retryData();else if (!this.media) hooks.status(this.data?.open ? 'Waiting for an answer' : 'Waiting for your person'); return; }
      this.opened = true;
      clearTimeout(this.connectTimer);
      if (invitation) this.bindData(this.peer.connect(invitation.peer, { reliable: true, serialization: 'binary' }));
      else {
        const published = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
        hooks.invite(createInvitationUrl(id, this.token, location.href, published)); hooks.status('Waiting for your person');
      }
    });
    this.peer.on('connection', conn => {
      if (this.closed || invitation || this.data && !(this.accepted && conn.peer === this.remotePeer) || this.recovering && conn.peer !== this.remotePeer) { conn.on('open', () => conn.close()); return; }
      // A failed network path can remain open at this end. The same peer must still prove its invitation secret again.
      if(this.data){const stale=this.data;this.dataLost(stale);stale.close();}
      this.bindData(conn);
    });
    this.peer.on('call', call => call.close());
    this.peer.on('error', err => {
      if (this.closed) return;
      if(this.recovering&&err.type==='peer-unavailable'){if(this.data){const conn=this.data;this.dataLost(conn);conn.close();}else this.retryData();return;}
      if (['network','server-error','socket-error','socket-closed'].includes(err.type) && (this.data?.open||this.recovering)) { this.reconnectSignaling(); return; }
      this.fail(err.type === 'peer-unavailable' ? 'This invitation has expired. Ask for a new link.' : `Could not connect (${err.type}). Try again or add a TURN relay in Settings.`);
    });
    this.peer.on('disconnected', () => { if (!this.closed) this.reconnectSignaling(); });
  }
  private reconnectSignaling() {
    if (this.closed || this.reconnectTimer || !this.peer.disconnected) return;
    if (!this.data?.open) this.hooks.status('Reconnecting · keep this page open');
    if (this.reconnectAttempts >= 5) { if (!this.data?.open) this.fail('Connection interrupted. Check your network and start a new call.'); return; }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.closed || this.peer.destroyed) return;
      this.reconnectAttempts++;
      try { if (this.peer.disconnected) this.peer.reconnect(); } catch { /* Retry without interrupting established peer media. */ }
      this.reconnectSignaling();
    }, Math.min(1000 * 2 ** this.reconnectAttempts, 8000));
  }
  private dataLost(conn: DataConnection) {
    if (this.closed || this.data !== conn) return;
    clearTimeout(this.handshakeTimer); this.data=undefined;
    if (!this.accepted) { if(this.invitation||this.authenticated)this.fail('Connection closed. Start a new call to reconnect.'); return; }
    this.recovering=true;this.authenticated=false;
    this.hooks.status('Connection interrupted · trying to reconnect…');
    if(!this.recoveryDeadline)this.recoveryDeadline=setTimeout(()=>this.fail('Could not reconnect. Check your network and start a new call.'),45000);
    this.retryData();
  }
  private retryData() {
    if(this.closed||!this.recovering||!this.invitation||this.data||this.dataRetryTimer)return;
    this.dataRetryTimer=setTimeout(()=>{
      this.dataRetryTimer=undefined;if(this.closed||!this.recovering||this.data)return;
      if(this.peer.disconnected){this.reconnectSignaling();this.retryData();return;}
      try{this.bindData(this.peer.connect(this.invitation!.peer,{reliable:true,serialization:'binary'}));}catch{this.retryData();}
    },2000);
  }
  private restored() {
    this.recovering=false;clearTimeout(this.recoveryDeadline);this.recoveryDeadline=undefined;clearTimeout(this.dataRetryTimer);this.dataRetryTimer=undefined;
    if(!this.invitation)this.send({type:'accepted'});
    if(this.local)this.send({type:'ready'});
    if(this.closed||!this.authenticated)return;
    if(this.media&&!this.invitation)void this.media.offer(true).catch(()=>this.fail('Could not restore media. Try a new call.'));
    this.hooks.status(this.media?.pc.connectionState==='connected'?'Connected':'Reconnected · getting your call ready…');
    this.hooks.packet({type:'reconnected'});
  }
  private bindData(conn: DataConnection) {
    if (this.closed) { conn.close(); return; }
    this.data = conn;
    const handshake = this.handshakeTimer = setTimeout(() => { if (!this.closed && this.data === conn && !this.authenticated) { if(this.recovering){this.dataLost(conn);conn.close();}else{this.data=undefined;conn.close();if(this.invitation)this.fail('The invitation handshake timed out. Ask for a new link.');else this.hooks.status('Waiting for your person');}} }, 15000);
    conn.on('open', () => {
      if (this.closed || this.data !== conn) { conn.close(); return; }
      if (this.invitation && !this.raw({type:'hello',token:this.token,name:this.config.name,protocol:3})) return;
      this.hooks.status('Waiting for an answer');
    });
    conn.on('data', value => {
      if (this.closed || this.data !== conn) return;
      if (!validPacket(value)) return;
      const p = value;
      if (p.type === 'hello' && !this.invitation && !this.authenticated) {
        if (p.token !== this.token) {clearTimeout(handshake);this.data=undefined;conn.close();return;}
        if (p.protocol !== 3) { this.fail('This call is from an older version. Update Near on both devices and start a new call.'); return; }
        this.authenticated = true; clearTimeout(handshake);
        this.remotePeer=conn.peer;
        if(!this.raw({type:'welcome',name:this.config.name,role:this.config.role,mode:this.config.mode,protocol:3}))return;
        if(this.recovering){this.restored();return;}
        this.hooks.request(String(p.name)); return;
      }
      if (p.type === 'welcome' && this.invitation && !this.authenticated) {
        if (p.protocol !== 3) { this.fail('This call is from an older version. Update Near on both devices and start a new call.'); return; }
        this.authenticated = true; clearTimeout(handshake);
        if(this.recovering){this.restored();return;}
        this.config.role = p.role === 'guide' ? 'camera' : 'guide'; this.config.mode = p.mode as Mode;
        this.hooks.joined(String(p.name),this.config.role,this.config.mode); return;
      }
      if (!this.authenticated) return;
      if (p.type === 'reject') { this.fail('Call declined.'); return; }
      if (p.type === 'accepted' && this.invitation) {if(!this.accepted){this.accepted=true;this.hooks.packet(p);}return;}
      if (!this.accepted) return;
      if (p.type.startsWith('rtc-')) {
        if (p.type === 'rtc-offer' && !this.invitation || p.type === 'rtc-answer' && this.invitation) return;
        if (this.local) void Promise.resolve().then(() => this.ensureMedia().signal(p)).catch(() => this.fail('Media negotiation failed. Try a new call.'));
        return;
      }
      if (p.type === 'ready') { this.otherReady=true;this.maybeCall();return; }
      if (p.type === 'end') { this.fail('Your person left the call.');return; }
      if (p.type === 'ping') { this.send({type:'pong'});return; }
      this.hooks.packet(p);
    });
    conn.on('close', () => { clearTimeout(handshake); this.dataLost(conn); });
    conn.on('error', () => { if (!this.closed && this.data === conn) { this.dataLost(conn);conn.close(); } });
  }
  accept() { if(this.closed||!this.authenticated||this.accepted)return; this.accepted = true; this.send({type:'accepted'}); }
  decline() { this.raw({type:'reject'}); setTimeout(()=>this.close(),150); }
  setStream(stream: MediaStream) { if(this.closed){stream.getTracks().forEach(t=>t.stop());return;} this.local=stream;this.send({type:'ready'});this.maybeCall(); }
  private maybeCall() {
    if (this.closed || this.invitation || !this.otherReady || !this.local || this.calling || !this.data || !this.accepted) return;
    this.calling = true; this.hooks.status('Connecting your call…');
    this.connectTimer = setTimeout(() => this.fail('Media could not connect. Configure a TURN relay in Settings and try again.'), 35000);
    void Promise.resolve().then(() => this.ensureMedia().offer()).catch(() => this.fail('Could not start the media connection. Try a new call.'));
  }
  private ensureMedia() {
    if (!this.media) this.media = new MediaTransport(this.local!, this.config.iceServers, {
      send: packet => this.send(packet),
      stream: stream => { clearTimeout(this.connectTimer); this.hooks.status('Connected'); this.hooks.stream(stream); },
      error: reason => this.fail(reason),
      status: message => this.hooks.status(message),
    }, !this.invitation);
    return this.media;
  }
  async replaceVideo(track: MediaStreamTrack | null) { await this.ensureMedia().replace('video', track); }
  async replaceAudio(track: MediaStreamTrack | null) { await this.ensureMedia().replace('audio', track); }
  async pauseVideo(paused: boolean) { if (!this.closed) await this.ensureMedia().pauseVideo(paused); }
  async qualityStats() {
    if (this.closed || !this.media) return null;
    const reports = await this.media.pc.getStats();
    let received = 0, lost = 0, rtt = 0;
    reports.forEach(report => {
      if (report.type === 'inbound-rtp' && !report.isRemote) { received += report.packetsReceived || 0; lost += Math.max(0, report.packetsLost || 0); }
      if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) rtt = Math.max(rtt, report.currentRoundTripTime || 0);
    });
    return { received, lost, rtt };
  }
  private raw(packet: Packet) {if(this.closed||!this.data?.open)return false;const conn=this.data;try{conn.send(packet);return true;}catch{this.dataLost(conn);conn.close();return false;}}
  send(packet: Packet) {return this.authenticated?this.raw(packet):false;}
  get bufferedAmount() {return this.data?.dataChannel?.bufferedAmount || 0;}
  get connected() {return !this.closed && this.authenticated && this.accepted && !!this.data?.open;}
  private fail(reason: string) {if(this.closed)return;this.close();this.hooks.ended(reason);}
  close() {if(this.closed)return;this.closed=true;clearTimeout(this.connectTimer);clearTimeout(this.handshakeTimer);clearTimeout(this.reconnectTimer);clearTimeout(this.dataRetryTimer);clearTimeout(this.recoveryDeadline);try{if(this.authenticated&&this.data?.open)this.data.send({type:'end'});}catch{}this.local?.getTracks().forEach(t=>t.stop());this.media?.close();this.data?.close();this.peer.destroy();}
}

import { createIcons, ArrowUpRight, ArrowRight, ArrowDownLeft, Plus, Video, Phone, MessageCircle, Settings, HelpCircle, Link, Copy, Check, X, Mic, MicOff, VideoOff, MonitorUp, ScreenShareOff, SwitchCamera, Maximize, Minimize, MousePointer2, Navigation, ScanLine, ZoomIn, ZoomOut, Hand, LockKeyhole, ShieldCheck, ChevronDown, Send, Smile, Paperclip, Signal, Users, Move, Camera, CircleHelp, Download, CheckCheck, Volume2, SlidersHorizontal, LogOut } from 'lucide';
import { CallSession, type SessionConfig } from './connection';
import { type Role, type Mode, type Point, type Packet, FileAssembly, MAX_FILE, CHUNK_SIZE, clamp, fitRect, normalizedPoint, inviteFromHash, safeFilename } from './protocol';
import { PatchTracker } from './tracker';
import './style.css';

const icons = {ArrowUpRight,ArrowRight,ArrowDownLeft,Plus,Video,Phone,MessageCircle,Settings,HelpCircle,Link,Copy,Check,X,Mic,MicOff,VideoOff,MonitorUp,ScreenShareOff,SwitchCamera,Maximize,Minimize,MousePointer2,Navigation,ScanLine,ZoomIn,ZoomOut,Hand,LockKeyhole,ShieldCheck,ChevronDown,Send,Smile,Paperclip,Signal,Users,Move,Camera,CircleHelp,Download,CheckCheck,Volume2,SlidersHorizontal,LogOut};
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const icon = (name: string, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;
const paintIcons = () => createIcons({icons,attrs:{'stroke-width':1.7}});
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const modeLabel = {guided:'Guided camera',video:'Video call',voice:'Voice call'};
const state = { role:'guide' as Role, mode:'guided' as Mode, tool:'direction', demo:true, connected:false, mic:true, camera:true, zoom:1, tilt:false, pointerAllowed:false, remotePointerAllowed:false, localSharing:false, remoteSharing:false, name:'You', otherName:'Your person', invite:'', started:0, unread:0 };
let session: CallSession | undefined;
let localStream: MediaStream | undefined, remoteStream: MediaStream | undefined;
let cameraTrack: MediaStreamTrack | undefined, placeholderTrack: MediaStreamTrack | undefined, displayStream: MediaStream | undefined;
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let sensorTimer: ReturnType<typeof setTimeout> | undefined;
let lastGuidance = 0, lastPointerSend = 0, pendingGuestName = '';
let tiltBaseline: {beta:number;gamma:number} | undefined;
let arrowPoint: Point = {x:.5,y:.5};
const tracker = new PatchTracker();
const outgoing = new Map<string,File>();
const sending = new Set<string>();
const incoming = new Map<string,{name:string;size:number;assembly?:FileAssembly;row:HTMLElement}>();
const blobUrls: string[] = [];
const invitation = inviteFromHash(location.hash);
if(invitation) history.replaceState(null,'',location.pathname+location.search); // Keep invitation secret out of future screenshots/history entries.

$('#app').innerHTML = `
<div class="app-shell">
 <aside class="sidebar">
  <a class="brand" href="${location.pathname}" aria-label="Near home"><span class="brand-mark">${icon('navigation')}</span>near<span class="brand-dot">.</span></a>
  <div class="workspace-label">A LITTLE CLOSER, FROM ANYWHERE</div>
  <button class="new-call" data-action="new">${icon('plus')} New call <span>↗</span></button>
  <nav aria-label="Main navigation"><button class="nav-item selected" data-action="calls">${icon('video')} Calls <span class="nav-dot"></span></button><button class="nav-item" data-action="chat">${icon('message-circle')} Conversation <span id="unread" hidden>0</span></button></nav>
  <div class="sidebar-rule"></div><div class="small-heading">YOUR SPACE</div>
  <button class="session-item" data-action="calls"><span class="session-avatar">${icon('navigation')}</span><span><strong id="sidebar-session">Try a guided call</strong><small id="sidebar-status">Interactive preview</small></span></button>
  <div class="sidebar-note"><span class="mini-orbit">${icon('users')}</span><h3>Be there. From here.</h3><p>A second pair of eyes makes all the difference.</p><button data-action="help">Meet guided camera ${icon('arrow-up-right')}</button></div>
  <div class="sidebar-bottom"><button class="nav-item" data-action="help">${icon('help-circle')} How Near works</button><button class="nav-item" data-action="settings">${icon('settings')} Settings</button><div class="profile"><span class="profile-avatar">Y</span><span><strong id="profile-name">Your space</strong><small>No account needed</small></span><span class="online-dot"></span></div></div>
 </aside>
 <main>
  <header class="page-header"><div><div class="eyebrow">GOOD TO BE NEAR</div><h1>A helping hand, from anywhere<span>.</span></h1><p>See it together. Figure it out together.</p></div><button class="button primary header-invite" data-action="new">${icon('plus')} Start a call</button><button class="mobile-settings icon-button" data-action="settings" aria-label="Settings">${icon('settings')}</button></header>
  <div class="session-bar"><div class="mode-tabs" role="tablist" aria-label="Call mode"><button role="tab" aria-selected="true" data-mode="guided">${icon('navigation')} Guided camera</button><button role="tab" aria-selected="false" data-mode="video">${icon('video')} Video</button><button role="tab" aria-selected="false" data-mode="voice">${icon('phone')} Voice</button></div><button class="text-button how-button" data-action="help">${icon('circle-help')} How it works</button></div>
  <div class="call-layout">
   <section class="call-column" aria-label="Call workspace">
    <div class="call-card">
     <div class="call-heading"><div class="call-title"><span class="call-status-dot"></span><strong id="call-title">A little guidance goes a long way</strong><span class="preview-tag" id="call-badge">PREVIEW</span></div><button class="icon-button" data-action="fullscreen" aria-label="Enter fullscreen">${icon('maximize')}</button></div>
     <div class="video-stage" id="stage" tabindex="0" aria-label="Camera guidance. Drag to point; use arrow keys for directions and space to hold still.">
      <div class="media-plane" id="media-plane"><img id="demo-scene" src="./workshop.svg" alt="Illustrated coffee machine on a workbench — demo scene"/><video id="main-video" autoplay playsinline muted hidden></video><div class="voice-view" id="voice-view" hidden><div class="voice-orbit"><span id="voice-initial">N</span></div><h2 id="voice-name">A voice can make all the difference.</h2><p id="voice-caption">Choose Start a call to connect.</p><div class="voice-wave"><b></b><b></b><b></b><b></b><b></b><b></b><b></b></div></div></div>
      <div class="stage-top"><span class="camera-label" id="camera-label">${icon('camera')} Demo camera <span>·</span> Try it out</span><span class="stage-encryption" id="stage-encryption">${icon('lock-keyhole')} Private by design</span></div>
      <div id="guidance-layer" aria-hidden="true"><div id="direction-arrow" class="direction-arrow" hidden><svg viewBox="0 0 160 160"><defs><linearGradient id="arrow-fill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b9ffbc"/><stop offset="1" stop-color="#4acb92"/></linearGradient></defs><path d="M25 70h70V39l45 41-45 41V90H25z" fill="#1e7252" transform="translate(0 9)"/><path d="M25 70h70V39l45 41-45 41V90H25z" fill="url(#arrow-fill)" stroke="#d3ffcf" stroke-width="2"/></svg></div><div id="depth-arrow" hidden><svg viewBox="0 0 120 140"><path d="m25 100 35-25 35 25v20L60 95l-35 25z"/><path d="m25 65 35-25 35 25v20L60 60 25 85z"/><path d="M25 30 60 5l35 25v20L60 25 25 50z"/></svg></div><div id="target-marker" class="target-marker" hidden><span></span><label>Target locked</label></div><div id="remote-pointer" hidden>${icon('mouse-pointer-2')}<span>Guide</span></div></div>
      <div class="demo-guide" id="demo-guide"><span class="demo-guide-icon">${icon('move')}</span><div><strong>Less explaining. More showing.</strong><span>Drag anywhere to guide the camera.</span></div></div>
      <div class="guidance-message" id="guidance-message" role="status" hidden></div>
      <div class="local-preview" id="local-preview" hidden><video id="local-video" autoplay playsinline muted></video><span>You</span></div>
      <div class="stage-bottom"><span id="stage-status"><span class="little-dot"></span> Interactive demo · no call connected</span><div class="zoom-control"><button data-action="zoom-out" aria-label="Zoom out">${icon('zoom-out')}</button><span id="zoom-value">1×</span><button data-action="zoom-in" aria-label="Zoom in">${icon('zoom-in')}</button></div></div>
     </div>
     <div class="guide-toolbar" id="guide-toolbar"><div class="tool-heading">${icon('navigation')} <span>GUIDE TOOLS</span></div><div class="tools"><button class="tool active" data-tool="direction" title="Drag on the video to guide camera direction">${icon('move')}<span>Direct</span></button><button class="tool" data-tool="lock" title="Tap an object to track its image locally">${icon('scan-line')}<span>Lock target</span></button><span class="tool-divider"></span><button class="tool" data-action="closer">${icon('zoom-in')}<span>Come closer</span></button><button class="tool" data-action="hold">${icon('hand')}<span>Hold still</span></button><button class="tool" data-action="pointer">${icon('mouse-pointer-2')}<span>Pointer</span></button></div><button class="icon-button clear-tool" data-action="clear" title="Clear guidance" aria-label="Clear guidance">${icon('x')}</button></div>
     <div class="call-controls"><div class="connection-state"><span class="signal-icon">${icon('signal')}</span><span id="connection-text">Ready when you are<small id="timer">A browser is all you need</small></span></div><div class="control-buttons"><button class="round-control" id="mic-btn" data-action="mic" aria-label="Mute microphone" title="Microphone">${icon('mic')}</button><button class="round-control" id="camera-btn" data-action="camera" aria-label="Turn camera off" title="Camera">${icon('video')}</button><button class="round-control" id="share-btn" data-action="share" aria-label="Share screen" title="Share screen">${icon('monitor-up')}</button><button class="round-control" data-action="flip" aria-label="Switch camera" title="Switch camera">${icon('switch-camera')}</button><button class="round-control end-control" data-action="end" aria-label="End call" title="End call">${icon('phone')}</button></div><button class="chat-toggle round-control" data-action="chat" aria-label="Open conversation">${icon('message-circle')}<span id="chat-unread" hidden></span></button></div>
    </div>
    <div class="below-call"><div class="tip-icon">${icon('sparkles')}</div><p><strong>Point the way, naturally.</strong> Drag to guide. Release to hold still. A little closer? Just ask.</p><button class="text-button" id="role-button" data-action="role">Try Camera view ${icon('arrow-right')}</button></div>
    <div class="privacy-strip">${icon('shield-check')} <span>Direct connection. Encrypted calls. No account needed.</span><button data-action="privacy">Learn more ${icon('arrow-up-right')}</button></div>
   </section>
   <aside class="chat-panel" id="chat-panel" aria-label="Conversation"><div class="chat-heading"><div><h2>Conversation <span id="chat-count">0</span></h2><p>A little space to share.</p></div><button class="icon-button chat-close" data-action="chat" aria-label="Close conversation">${icon('x')}</button></div><div class="chat-session-note">${icon('lock-keyhole')} Only between the two of you</div><div class="messages" id="messages" aria-live="polite"><div class="chat-empty" id="chat-empty"><div class="chat-empty-icon">${icon('message-circle')}</div><h3>On the same page.</h3><p>Send a thought, a photo, or a little encouragement.</p><span>Messages stay in this tab.<br>Demo messages aren’t sent.</span></div></div><div class="chat-bottom"><div class="emoji-picker" id="emoji-picker" hidden>${['👋','👍','😊','❤️','🙌','🔧','✅','☕','🎉','🙏','👀','💡'].map(e=>`<button data-emoji="${e}" aria-label="Insert ${e}">${e}</button>`).join('')}</div><form id="chat-form"><textarea id="chat-input" aria-label="Message" placeholder="Write a message…" rows="1" maxlength="4000"></textarea><div class="compose-actions"><div><button type="button" class="icon-button" data-action="attach" aria-label="Attach file">${icon('paperclip')}</button><button type="button" class="icon-button" data-action="emoji" aria-label="Choose emoji">${icon('smile')}</button></div><button class="send-button" type="submit" aria-label="Send message">${icon('send')}</button></div></form><span class="chat-footnote">${icon('shield-check')} Encrypted in a connected call</span></div></aside>
  </div>
  <footer><span>Made for the moments you need a hand.</span><span class="footer-wordmark">near.</span></footer>
 </main>
</div><div class="mobile-bar"><button data-action="new">${icon('plus')} Start a call</button><button data-action="help">${icon('circle-help')} How it works</button></div><input type="file" id="file-input" hidden/><dialog id="dialog"><div id="dialog-content"></div></dialog><div id="toast" role="status" hidden></div>`;
// Replace the only decorative icon not included in the set.
$('.tip-icon').innerHTML=icon('navigation');
paintIcons();
const stage = $('#stage'), mainVideo = $<HTMLVideoElement>('#main-video'), localVideo = $<HTMLVideoElement>('#local-video');
const dialog = $<HTMLDialogElement>('#dialog');

function toast(message: string) { const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout((toast as unknown as {timer:number}).timer);(toast as unknown as {timer:number}).timer=window.setTimeout(()=>el.hidden=true,4500); }
function showDialog(html: string) { $('#dialog-content').innerHTML=`<button class="dialog-close icon-button" data-close aria-label="Close dialog">${icon('x')}</button>${html}`;paintIcons();if(!dialog.open)dialog.showModal();$('[data-close]').addEventListener('click',()=>dialog.close()); }
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
dialog.addEventListener('close',()=>{if(pendingGuestName&&session&&!session.accepted){pendingGuestName='';session.decline();endSession('Call declined.');}});
function setButtonIcon(selector: string, name: string) {$(selector).innerHTML=icon(name);paintIcons();}
function formatSize(n: number) {return n<1024?`${n} B`:n<1024*1024?`${(n/1024).toFixed(1)} KB`:`${(n/1024/1024).toFixed(1)} MB`;}
function setStatus(s: string) {$('#connection-text').firstChild!.textContent=s;$('#sidebar-status').textContent=s;}
function instruction(text: string, symbol='hand', duration=3000) { const el=$('#guidance-message');el.innerHTML=`${icon(symbol)}<span>${esc(text)}</span>`;el.hidden=false;$('#demo-guide').hidden=true;$('#depth-arrow').hidden=symbol!=='zoom-in';if(symbol==='zoom-in')$('#direction-arrow').hidden=true;paintIcons();clearTimeout(holdTimer);holdTimer=setTimeout(()=>{el.hidden=true;$('#depth-arrow').hidden=true;if(state.demo)$('#demo-guide').hidden=false;},duration); }
function packet(p: Packet) { if(state.connected)session?.send(p); }
function clearGuidance(send=true) {tracker.stop();$('#target-marker').hidden=true;$('#direction-arrow').hidden=true;$('#depth-arrow').hidden=true;$('#guidance-message').hidden=true;$('#remote-pointer').hidden=true;if(send)packet({type:'clear'});}
function setMode(mode: Mode) {if(!state.demo){toast('Choose a call mode when starting a new call.');return;}state.mode=mode;clearGuidance();renderState();}
function renderState() {
 document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.mode===state.mode));b.disabled=!state.demo;});
 const cameraGuidance=state.mode==='guided'&&state.role==='guide'&&!state.localSharing&&!state.remoteSharing;
 $('#guide-toolbar').hidden=!cameraGuidance&&!state.localSharing&&!state.remoteSharing;
 document.querySelectorAll<HTMLElement>('#guide-toolbar [data-tool],#guide-toolbar [data-action="closer"],#guide-toolbar [data-action="hold"],#guide-toolbar .tool-divider').forEach(el=>el.hidden=!cameraGuidance);
 $('.tool-heading').innerHTML=`${icon(cameraGuidance?'navigation':'mouse-pointer-2')} <span>${cameraGuidance?'GUIDE TOOLS':'SHARED SCREEN'}</span>`;
 $('#role-button').hidden=!state.demo;$('#role-button').innerHTML=`Try ${state.role==='guide'?'Camera':'Guide'} view ${icon('arrow-right')}`;
 $('#demo-guide').hidden=!state.demo||state.mode!=='guided';
 if(state.demo) {$('#call-title').textContent=state.mode==='guided'?'A little guidance goes a long way':state.mode==='video'?'A familiar face, wherever you are':'Good things start with a hello';$('#call-badge').textContent='PREVIEW';$('#camera-label').innerHTML=`${icon('camera')} Demo camera <span>·</span> ${state.role==='guide'?'Try it out':'Camera view'}`;}
 $('#mic-btn').classList.toggle('disabled-control',!state.mic);$('#mic-btn').setAttribute('aria-label',state.mic?'Mute microphone':'Unmute microphone');setButtonIcon('#mic-btn',state.mic?'mic':'mic-off');
 $('#camera-btn').classList.toggle('disabled-control',!state.camera);$('#camera-btn').setAttribute('aria-label',state.camera?'Turn camera off':'Turn camera on');setButtonIcon('#camera-btn',state.camera?'video':'video-off');
 $('#share-btn').classList.toggle('active-control',state.localSharing);setButtonIcon('#share-btn',state.localSharing?'screen-share-off':'monitor-up');
 renderMedia();paintIcons();
}
function renderMedia() {
 const voice=state.mode==='voice'&&!state.localSharing&&!state.remoteSharing;
 const localMain=state.localSharing||(!state.remoteSharing&&state.mode==='guided'&&state.role==='camera');
 const stream=localMain?(state.localSharing?displayStream:localStream):remoteStream;
 const visibleVideo=!!stream?.getVideoTracks().some(t=>t.readyState==='live') && !voice && (localMain?state.camera||state.localSharing:true);
 $('#demo-scene').hidden=!state.demo||voice;$('#voice-view').hidden=!voice&& (state.demo||visibleVideo);mainVideo.hidden=state.demo||!visibleVideo||voice;
 if(mainVideo.srcObject!==stream)mainVideo.srcObject=stream||null;
 mainVideo.muted=localMain; // Main video supplies remote audio except when it shows the local camera.
 const audio=$<HTMLAudioElement>('#remote-audio') || Object.assign(document.createElement('audio'),{id:'remote-audio',autoplay:true});
 if(!audio.parentElement)document.body.append(audio);audio.srcObject=remoteStream||null;audio.muted=!localMain&&!voice&&!mainVideo.hidden;
 if(remoteStream)void audio.play().catch(()=>toast('Tap the video to enable call audio.'));
 if(!mainVideo.hidden)void mainVideo.play().catch(()=>{});
 const showLocal=!state.demo&&!!cameraTrack&&state.camera&&!localMain&&state.mode==='video';$('#local-preview').hidden=!showLocal;
 if(showLocal){localVideo.srcObject=new MediaStream([cameraTrack!]);void localVideo.play().catch(()=>{});}
 if(!state.demo){$('#camera-label').innerHTML=`${icon(state.localSharing||state.remoteSharing?'monitor-up':'camera')} ${state.localSharing?'Your screen':state.remoteSharing?esc(state.otherName)+"’s screen":localMain?'Your camera':esc(state.otherName)+"’s camera"}`;$('#voice-name').textContent=state.otherName;$('#voice-caption').textContent=state.connected?'You’re connected. Take your time.':'Waiting for media…';$('#voice-initial').textContent=state.otherName.slice(0,1).toUpperCase();}
 paintIcons();applyZoom();
}
function applyZoom() {$('#media-plane').style.transform=`scale(${state.zoom})`;$('#zoom-value').textContent=`${Number(state.zoom.toFixed(1))}×`;}
function videoRect() {const b=stage.getBoundingClientRect();const w=state.demo?1200:mainVideo.videoWidth||1200,h=state.demo?820:mainVideo.videoHeight||820;const cropped=state.demo&&innerWidth<=600;const scale=cropped?Math.max(b.width/w,b.height/h):0;const r=cropped?{left:(b.width-w*scale)/2,top:(b.height-h*scale)/2,width:w*scale,height:h*scale}:fitRect(b.width,b.height,w,h);return {left:b.left+r.left,top:b.top+r.top,width:r.width,height:r.height};}
function pointFromEvent(e: PointerEvent): Point {const r=videoRect();const p=normalizedPoint(e.clientX,e.clientY,r);return{x:clamp((p.x-.5)/state.zoom+.5),y:clamp((p.y-.5)/state.zoom+.5)};}
function place(el:HTMLElement,p:Point){const b=stage.getBoundingClientRect(),r=videoRect();el.style.left=`${r.left-b.left+((p.x-.5)*state.zoom+.5)*r.width}px`;el.style.top=`${r.top-b.top+((p.y-.5)*state.zoom+.5)*r.height}px`;}
function drawArrow(p: Point, dx:number,dy:number) {const el=$('#direction-arrow');arrowPoint=p;place(el,p);el.style.setProperty('--angle',`${Math.atan2(dy,dx)*180/Math.PI}deg`);el.hidden=false;$('#depth-arrow').hidden=true;$('#guidance-message').hidden=true;$('#demo-guide').hidden=true;lastGuidance=Date.now();}
function target(p:Point, label='Target locked') {const el=$('#target-marker');place(el,p);el.hidden=false;$<HTMLLabelElement>('#target-marker label').textContent=label;}
let drag: {start:Point;id:number;moved:boolean} | undefined;
stage.addEventListener('pointerdown',e=>{
 if((e.target as HTMLElement).closest('button')||state.mode==='voice'&&!state.localSharing&&!state.remoteSharing)return;
 void $<HTMLAudioElement>('#remote-audio')?.play().catch(()=>{});
 if(state.role!=='guide'&&!(state.tool==='pointer'&&state.remoteSharing&&state.remotePointerAllowed)){if(state.demo)instruction('Your guide will point the way. Keep the camera steady.');return;}
 if((state.localSharing||state.remoteSharing)&&state.tool!=='pointer')return;
 if(state.tool==='pointer'&&!state.demo&&!state.remotePointerAllowed){toast('Ask your person to allow the shared pointer first.');return;}
 if(!state.demo&&!state.connected){toast('Connect to your person first.');return;}
 const p=pointFromEvent(e);stage.setPointerCapture(e.pointerId);drag={start:p,id:e.pointerId,moved:false};clearTimeout(holdTimer);tracker.stop();$('#target-marker').hidden=true;
 if(state.tool==='lock') {if(state.demo)target(p,'Demo target');else if(tracker.lock(mainVideo,p)){target(p);packet({type:'target',...p});}else toast('Wait for the camera video before locking a target.');return;}
 if(state.tool==='pointer'){sendPointer(p);return;}
 drawArrow(p,.15,0);packet({type:'arrow',...p,dx:.15,dy:0});
});
stage.addEventListener('pointermove',e=>{
 if(!drag||drag.id!==e.pointerId)return;const p=pointFromEvent(e);drag.moved=true;
 if(state.tool==='pointer'){if(Date.now()-lastPointerSend>45){sendPointer(p);lastPointerSend=Date.now();}return;}
 if(state.tool==='lock')return;
 const dx=clamp(p.x-drag.start.x,-1,1),dy=clamp(p.y-drag.start.y,-1,1);drawArrow(drag.start,dx,dy);
 if(Date.now()-lastPointerSend>45){packet({type:'arrow',...drag.start,dx,dy});lastPointerSend=Date.now();}
});
function releaseDrag(){if(!drag)return;drag=undefined;if(state.tool==='direction'){ $('#direction-arrow').hidden=true;instruction('Perfect. Hold still here.');packet({type:'hold'});}}
stage.addEventListener('pointerup',releaseDrag);stage.addEventListener('pointercancel',releaseDrag);stage.addEventListener('lostpointercapture',releaseDrag);
stage.addEventListener('keydown',e=>{if(state.role!=='guide'||state.mode!=='guided'||(!state.demo&&!state.connected))return;const d:Record<string,[number,number]>={ArrowLeft:[-.3,0],ArrowRight:[.3,0],ArrowUp:[0,-.3],ArrowDown:[0,.3]};if(d[e.key]){e.preventDefault();drawArrow({x:.5,y:.5},...d[e.key]);packet({type:'arrow',x:.5,y:.5,dx:d[e.key][0],dy:d[e.key][1]});}if(e.code==='Space'){e.preventDefault();instruction('Perfect. Hold still here.');packet({type:'hold'});$('#direction-arrow').hidden=true;}});
stage.addEventListener('keyup',e=>{if(e.key.startsWith('Arrow')){$('#direction-arrow').hidden=true;instruction('Perfect. Hold still here.');packet({type:'hold'});}});
function sendPointer(p:Point){const el=$('#remote-pointer');place(el,p);el.hidden=false;packet({type:'pointer',...p});}
setInterval(()=>{
 if(!$('#direction-arrow').hidden&&Date.now()-lastGuidance>2200&&!drag)$('#direction-arrow').hidden=true;
 if(tracker.active){const p=tracker.update(mainVideo);if(p){target(p);packet({type:'target',...p});}else if(!tracker.active){$('#target-marker').hidden=true;packet({type:'clear'});toast('Target lost. Tap to lock it again.');}}
},170);

function newCallDialog(join=false) {
 if(session){showInvite();return;}
 showDialog(`<div class="dialog-symbol">${icon(join?'link':'video')}</div><div class="eyebrow">${join?'YOU’RE INVITED':'A LITTLE CLOSER'}</div><h2>${join?'Someone could use a hand.':'Good things start with a hello.'}</h2><p>${join?'Join a private browser call. You choose whether to allow your microphone and camera when the call is accepted.':'Make a private link and send it to your person. No downloads. No accounts.'}</p><form id="start-form"><label class="field-label" for="your-name">Your name</label><input id="your-name" class="text-input" maxlength="60" value="${esc(localStorage.getItem('near-name')||'')}" placeholder="What should we call you?" required autocomplete="given-name"/>${join?'':`<label class="field-label" for="call-mode">Call type</label><select class="text-input" id="call-mode"><option value="guided" ${state.mode==='guided'?'selected':''}>Guided camera — see & solve together</option><option value="video" ${state.mode==='video'?'selected':''}>Two-way video</option><option value="voice" ${state.mode==='voice'?'selected':''}>Voice only</option></select><div class="role-options"><label><input name="role" value="camera" type="radio" checked/><span>${icon('camera')}<strong>I need a hand</strong><small>Share my camera</small></span></label><label><input name="role" value="guide" type="radio"/><span>${icon('navigation')}<strong>I’m here to help</strong><small>Guide their camera</small></span></label></div>`}<div class="permission-note">${icon('shield-check')} Your media stays off until you both agree to join.</div><button class="button primary full-width" type="submit">${join?'Join private call':'Create call link'} ${icon('arrow-right')}</button></form>`);
 $('#start-form').addEventListener('submit',e=>{e.preventDefault();const name=$<HTMLInputElement>('#your-name').value.trim();if(!name)return;state.name=name;localStorage.setItem('near-name',name);const role=join?'guide':$<HTMLInputElement>('input[name="role"]:checked').value as Role;const mode=join?'guided':$<HTMLSelectElement>('#call-mode').value as Mode;dialog.close();startSession(role,mode,join);});
}
function getConfig(): Pick<SessionConfig,'iceServers'|'signaling'> {
 try {const saved=JSON.parse(sessionStorage.getItem('near-network')||'{}');const iceServers:RTCIceServer[]=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}];if(saved.turn)iceServers.push({urls:saved.turn,username:saved.username,credential:saved.credential});return{iceServers,...(saved.host?{signaling:{host:saved.host,port:Number(saved.port)||443,path:saved.path||'/',secure:true}}:{})};}catch{return{iceServers:[{urls:'stun:stun.l.google.com:19302'}]};}
}
function startSession(role:Role,mode:Mode,join:boolean) {
 resetMedia();state.demo=false;state.role=role;state.mode=mode;state.connected=false;state.invite='';state.otherName='Your person';clearGuidance();renderState();$('#call-badge').textContent='WAITING';$('#call-title').textContent=modeLabel[mode];$('#stage-status').textContent='Waiting for a private connection';$('#sidebar-session').textContent='Private call';$('#profile-name').textContent=state.name;
 session=new CallSession({name:state.name,role,mode,...getConfig()},{
  status:setStatus,
  invite:url=>{state.invite=url;showInvite();},
  request:name=>{pendingGuestName=name;state.otherName=name;showDialog(`<div class="dialog-symbol">${icon('phone')}</div><h2>${esc(name)} is here.</h2><p>Accept to connect your microphone${state.mode==='video'||state.role==='camera'&&state.mode==='guided'?' and camera':''}. Your role is <strong>${state.role==='guide'?'Guide':'Camera'}</strong>.</p><div class="dialog-actions"><button class="button" id="decline-call">Decline</button><button class="button primary" id="accept-call">${icon('phone')} Accept call</button></div>`);$('#accept-call').addEventListener('click',()=>{pendingGuestName='';session?.accept();dialog.close();void prepareMedia();});$('#decline-call').addEventListener('click',()=>{pendingGuestName='';session?.decline();dialog.close();endSession('Call declined.');});},
  joined:(name,r,m)=>{state.otherName=name;state.role=r;state.mode=m;renderState();$('#call-title').textContent=`${modeLabel[m]} with ${name}`;setStatus('Waiting for your person to accept');},
  packet:handlePacket,
  stream:stream=>{remoteStream=stream;state.connected=true;state.started=Date.now();$('#call-badge').textContent='CONNECTED';$('#call-badge').classList.add('connected-badge');$('#call-title').textContent=`${modeLabel[state.mode]} with ${state.otherName}`;$('#stage-status').innerHTML=`<span class="little-dot"></span> Connected · encrypted`;$('#stage-encryption').innerHTML=`${icon('lock-keyhole')} Encrypted call`;$('#sidebar-session').textContent=state.otherName;renderState();if(dialog.open)dialog.close();toast('You’re connected. Say hello!');},
  ended:reason=>endSession(reason)
 },join?invitation!:undefined);
 if(join)setStatus('Joining private call…');
}
function showInvite() {
 if(!state.invite){toast('Connecting… your invitation link will appear shortly.');return;}
 showDialog(`<div class="dialog-symbol">${icon('link')}</div><div class="eyebrow">BRING YOUR PERSON CLOSER</div><h2>One link. A little help.</h2><p>Share this private invitation with someone you trust. Keep this tab open while they join.</p><label class="field-label" for="invite-link">Private call link</label><div class="copy-field"><input id="invite-link" readonly value="${esc(state.invite)}"/><button class="icon-button" id="copy-invite" aria-label="Copy invitation">${icon('copy')}</button></div><button class="button primary full-width" id="share-invite">${icon('link')} Share invitation</button><div class="waiting-note"><span class="pulse-dot"></span> Waiting for your person…</div><p class="fine-print">Anyone with this link can request to join. You approve each call. This link expires when you leave.</p>`);
 $('#copy-invite').addEventListener('click',()=>void copyInvite());$('#share-invite').addEventListener('click',async()=>{if(navigator.share){try{await navigator.share({title:'Join me on Near',text:'A helping hand, from anywhere.',url:state.invite});}catch(e){if((e as Error).name!=='AbortError')void copyInvite();}}else void copyInvite();});
}
async function copyInvite(){try{await navigator.clipboard.writeText(state.invite);toast('Invitation copied. Send it to your person.');}catch{$<HTMLInputElement>('#invite-link').select();toast('Select and copy the invitation link.');}}
function blankVideo() {
 const c=document.createElement('canvas');c.width=16;c.height=16;const ctx=c.getContext('2d')!;ctx.fillStyle='#20352c';ctx.fillRect(0,0,16,16);const t=c.captureStream(1).getVideoTracks()[0];placeholderTrack=t;return t;
}
async function prepareMedia() {
 const activeSession=session;if(!activeSession)return;
 setStatus('Waiting for microphone permission…');
 try {
  const wantsVideo=state.mode==='video'||state.mode==='guided'&&state.role==='camera';
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:wantsVideo?{facingMode:{ideal:state.mode==='guided'?'environment':'user'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:24,max:30}}:false});
  if(session!==activeSession){stream.getTracks().forEach(t=>t.stop());return;}
  localStream=stream;cameraTrack=stream.getVideoTracks()[0];state.camera=wantsVideo;state.mic=true;
  if(!cameraTrack)stream.addTrack(blankVideo());
  activeSession.setStream(stream);setStatus('Connecting to your person…');renderState();
  if(state.role==='camera'&&state.mode==='guided')toast('Share what you need help with. Your guide can now point the way.');
 } catch(e) {
  const name=(e as Error).name;const why=name==='NotAllowedError'?'Camera or microphone permission was denied. Allow access in your browser, then start a new call.':name==='NotFoundError'?'No microphone or camera was found. Connect a device and try again.':`Could not start media: ${(e as Error).message}`;
  endSession(why);
 }
}
function resetMedia(){localStream?.getTracks().forEach(t=>t.stop());cameraTrack?.stop();placeholderTrack?.stop();displayStream?.getTracks().forEach(t=>t.stop());localStream=undefined;remoteStream=undefined;cameraTrack=undefined;placeholderTrack=undefined;displayStream=undefined;mainVideo.srcObject=null;mainVideo.style.visibility='visible';localVideo.srcObject=null;const a=$<HTMLAudioElement>('#remote-audio');if(a)a.srcObject=null;state.localSharing=false;state.remoteSharing=false;state.pointerAllowed=false;state.remotePointerAllowed=false;pendingGuestName='';}
function endSession(reason='Call ended. Your camera and microphone are off.') {
 const old=session;session=undefined;old?.close();resetMedia();clearGuidance(false);state.connected=false;state.demo=true;state.role='guide';state.invite='';state.started=0;state.camera=true;state.mic=true;state.zoom=1;outgoing.clear();incoming.forEach(f=>{if(f.assembly)f.row.querySelector('.file-status')!.textContent='Transfer interrupted';});incoming.clear();if(dialog.open)dialog.close();renderState();setStatus('Ready when you are');$('#timer').textContent='A browser is all you need';$('#sidebar-session').textContent='Try a guided call';$('#sidebar-status').textContent='Interactive preview';$('#call-badge').classList.remove('connected-badge');$('#stage-status').innerHTML='<span class="little-dot"></span> Interactive demo · no call connected';$('#stage-encryption').innerHTML=`${icon('lock-keyhole')} Private by design`;toast(reason);
}
async function toggleCamera(){
 if(state.demo){state.camera=!state.camera;renderState();toast(state.camera?'Camera on in preview.':'Camera off in preview.');return;}
 if(!state.connected){toast('Connect to a call first.');return;}
 if(state.mode==='voice'||state.mode==='guided'&&state.role==='guide'){toast('This call uses your microphone only. Choose Video when starting a new call to share your camera.');return;}
 if(state.localSharing){toast('Stop screen sharing to change your camera.');return;}
 state.camera=!state.camera;if(cameraTrack)cameraTrack.enabled=state.camera;packet({type:'camera-state',enabled:state.camera});renderState();
}
async function flipCamera(){
 if(state.demo){toast('In a call, this switches between your phone’s front and rear cameras.');return;}
 if(!cameraTrack||state.localSharing||!state.connected){toast('Turn on your camera first.');return;}
 try{const facing=cameraTrack.getSettings().facingMode==='environment'?'user':'environment';const activeSession=session;const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{exact:facing},width:{ideal:1280}},audio:false});const track=stream.getVideoTracks()[0];if(session!==activeSession){track.stop();return;}await session!.replaceVideo(track);cameraTrack.stop();cameraTrack=track;cameraTrack.enabled=state.camera;renderMedia();}catch{toast('Another camera isn’t available on this device.');}
}
async function screenShare(){
 if(!state.connected){toast('Start a call before sharing your screen.');return;}
 if(state.localSharing){await stopSharing();return;}
 if(state.remoteSharing){toast('Your person is sharing. Ask them to stop before sharing your screen.');return;}
 if(!navigator.mediaDevices.getDisplayMedia){toast('Screen sharing isn’t available in this browser. Try a desktop browser.');return;}
 try{const activeSession=session;const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});if(session!==activeSession){stream.getTracks().forEach(t=>t.stop());return;}displayStream=stream;await session!.replaceVideo(stream.getVideoTracks()[0]);state.localSharing=true;state.zoom=1;clearGuidance();packet({type:'screen',enabled:true});stream.getVideoTracks()[0].onended=()=>void stopSharing();renderState();}catch(e){if((e as Error).name!=='NotAllowedError')toast('Screen sharing could not start. Try a desktop browser.');}
}
async function stopSharing(){if(!state.localSharing)return;state.localSharing=false;try{await session?.replaceVideo(cameraTrack||placeholderTrack||blankVideo());}catch{toast('Could not restore the camera. Please restart the call.');}displayStream?.getTracks().forEach(t=>{t.onended=null;t.stop();});displayStream=undefined;state.pointerAllowed=false;state.remotePointerAllowed=false;packet({type:'screen',enabled:false});packet({type:'pointer-permission',enabled:false});clearGuidance();renderState();}

function handlePacket(p:Packet){
 switch(p.type){
 case 'accepted':void prepareMedia();break;
 case 'chat':addMessage(String(p.text),false);break;
 case 'arrow':if(state.role==='camera'&&state.mode==='guided'){clearTimeout(holdTimer);drawArrow({x:p.x as number,y:p.y as number},p.dx as number,p.dy as number);}break;
 case 'hold':if(state.role==='camera'){$('#direction-arrow').hidden=true;instruction('Perfect. Hold still here.');navigator.vibrate?.(30);}break;
 case 'closer':if(state.role==='camera'){instruction('Move your camera a little closer.','zoom-in',4500);navigator.vibrate?.([20,70,20]);}break;
 case 'further':if(state.role==='camera')instruction('Move your camera back a little.','zoom-out',4500);break;
 case 'target':if(state.role==='camera')target({x:p.x as number,y:p.y as number});break;
 case 'clear':clearGuidance(false);break;
 case 'screen':state.remoteSharing=p.enabled as boolean;state.zoom=1;state.remotePointerAllowed=false;state.pointerAllowed=false;if(p.enabled&&state.localSharing&&session&&session.peer.id>(session.data?.peer||'')){void stopSharing();toast('Your person also shared. Showing their screen first.');}clearGuidance(false);renderState();break;
 case 'camera-state':if(!state.remoteSharing){mainVideo.style.visibility=p.enabled?'visible':'hidden';if(!p.enabled)instruction('Your person turned their camera off.','video-off',4000);}break;
 case 'pointer-request':if(state.localSharing){showDialog(`<div class="dialog-symbol">${icon('mouse-pointer-2')}</div><h2>Show a shared pointer?</h2><p>${esc(state.otherName)} would like to point at your shared screen. This displays a cursor inside Near. It cannot click or control your device.</p><div class="dialog-actions"><button class="button" id="deny-pointer">Not now</button><button class="button primary" id="allow-pointer">Allow pointer</button></div>`);$('#allow-pointer').addEventListener('click',()=>{state.pointerAllowed=true;packet({type:'pointer-permission',enabled:true});dialog.close();toast('Shared pointer allowed. Use Pointer to revoke.');});$('#deny-pointer').addEventListener('click',()=>{packet({type:'pointer-permission',enabled:false});dialog.close();});}else packet({type:'pointer-permission',enabled:false});break;
 case 'pointer-permission':state.remotePointerAllowed=p.enabled as boolean;if(p.enabled){setTool('pointer');toast('Shared pointer allowed. Drag on the video to point.');}else{$('#remote-pointer').hidden=true;if(state.tool==='pointer')setTool('direction');toast('Shared pointer isn’t enabled.');}break;
 case 'pointer':if(state.localSharing&&state.pointerAllowed){place($('#remote-pointer'),{x:p.x as number,y:p.y as number});$('#remote-pointer').hidden=false;}break;
 case 'file-offer':receiveFileOffer(p);break;
 case 'file-accept':void sendFile(String(p.id));break;
 case 'file-reject':{const id=String(p.id);outgoing.delete(id);const row=document.getElementById(`file-${id}`);if(row)row.querySelector('.file-status')!.textContent='Declined';break;}
 case 'file-chunk':{const f=incoming.get(String(p.id));if(!f?.assembly)break;try{f.assembly.append(p.data as ArrayBuffer);f.row.querySelector('.file-status')!.textContent=`Receiving · ${Math.round(f.assembly.received/f.size*100)}%`;}catch{f.row.querySelector('.file-status')!.textContent='Transfer rejected';incoming.delete(String(p.id));}break;}
 case 'file-end':{const id=String(p.id),f=incoming.get(id);if(!f?.assembly)break;try{const url=URL.createObjectURL(f.assembly.finish());blobUrls.push(url);const a=document.createElement('a');a.href=url;a.download=f.name;a.className='file-download';a.innerHTML=`${icon('download')} Save file`;f.row.append(a);f.row.querySelector('.file-status')!.textContent='Received · '+formatSize(f.size);paintIcons();}catch{f.row.querySelector('.file-status')!.textContent='Incomplete transfer';}incoming.delete(id);break;}
 }
}
let messageCount=0;
function messageShell(mine:boolean):HTMLElement {$('#chat-empty')?.remove();const row=document.createElement('div');row.className=`message ${mine?'mine':'theirs'}`;const author=document.createElement('div');author.className='message-author';author.textContent=mine?'You':state.otherName;row.append(author);$('#messages').append(row);messageCount++;$('#chat-count').textContent=String(messageCount);if(!mine&&!$('#chat-panel').classList.contains('chat-open')&&innerWidth<=1100){state.unread++;$('#unread').textContent=String(state.unread);$('#unread').hidden=false;$('#chat-unread').hidden=false;}return row;}
function scrollMessages() {$('#messages').scrollTop=$('#messages').scrollHeight;}
function addMessage(text:string,mine:boolean){const row=messageShell(mine);const bubble=document.createElement('div');bubble.className='message-bubble';bubble.textContent=text;row.append(bubble);const time=document.createElement('span');time.className='message-time';time.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+(state.demo?' · Preview only':'');row.append(time);scrollMessages();}
$('#chat-form').addEventListener('submit',e=>{e.preventDefault();const input=$<HTMLTextAreaElement>('#chat-input'),text=input.value.trim();if(!text)return;if(!state.demo&&!state.connected){toast('Wait for your person to connect.');return;}addMessage(text,true);packet({type:'chat',text});input.value='';$('#emoji-picker').hidden=true;});
$('#chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$<HTMLFormElement>('#chat-form').requestSubmit();}});
document.querySelectorAll<HTMLButtonElement>('[data-emoji]').forEach(b=>b.addEventListener('click',()=>{const el=$<HTMLTextAreaElement>('#chat-input');el.value+=b.dataset.emoji!;el.focus();}));
function fileRow(id:string,name:string,size:number,mine:boolean,status:string){const row=messageShell(mine);row.id=`file-${id}`;const card=document.createElement('div');card.className='file-card';card.innerHTML=`${icon('paperclip')}<div><strong></strong><small class="file-status"></small></div>`;card.querySelector('strong')!.textContent=name;card.querySelector('small')!.textContent=status+' · '+formatSize(size);row.append(card);paintIcons();scrollMessages();return row;}
$<HTMLInputElement>('#file-input').addEventListener('change',e=>{const input=e.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;if(!file.size||file.size>MAX_FILE){toast('Choose a nonempty file up to 10 MB.');return;}if(outgoing.size>=3){toast('Finish pending transfers before sending more files.');return;}if(!state.demo&&!state.connected){toast('Connect before sending files.');return;}const id=crypto.randomUUID();fileRow(id,safeFilename(file.name),file.size,true,state.demo?'Preview only':'Waiting for approval');if(state.demo)return;outgoing.set(id,file);packet({type:'file-offer',id,name:safeFilename(file.name),size:file.size});});
function receiveFileOffer(p:Packet){const id=String(p.id);if(incoming.has(id)||incoming.size>=3)return;const name=safeFilename(String(p.name)),size=p.size as number,row=fileRow(id,name,size,false,'Wants to send a file');incoming.set(id,{name,size,row});const buttons=document.createElement('div');buttons.className='file-actions';buttons.innerHTML='<button class="button small" data-file-decline>Decline</button><button class="button primary small" data-file-accept>Receive</button>';row.append(buttons);buttons.querySelector('[data-file-accept]')!.addEventListener('click',()=>{const f=incoming.get(id);if(!f)return;f.assembly=new FileAssembly(size);packet({type:'file-accept',id});buttons.remove();row.querySelector('.file-status')!.textContent='Receiving…';});buttons.querySelector('[data-file-decline]')!.addEventListener('click',()=>{packet({type:'file-reject',id});incoming.delete(id);buttons.remove();row.querySelector('.file-status')!.textContent='Declined';});scrollMessages();}
async function sendFile(id:string){const file=outgoing.get(id),active=session;if(!file||!active||sending.has(id))return;sending.add(id);const status=document.getElementById(`file-${id}`)?.querySelector('.file-status');try{for(let offset=0;offset<file.size;offset+=CHUNK_SIZE){const deadline=Date.now()+15000;while(active.bufferedAmount>512*1024&&session===active&&active.connected){if(Date.now()>deadline)throw new Error('Transfer timed out');await new Promise(r=>setTimeout(r,60));}if(session!==active||!active.connected)throw new Error('Disconnected');const data=await file.slice(offset,offset+CHUNK_SIZE).arrayBuffer();active.send({type:'file-chunk',id,data});if(status)status.textContent=`Sending · ${Math.min(100,Math.round((offset+data.byteLength)/file.size*100))}%`;}active.send({type:'file-end',id});if(status)status.textContent='Sent · '+formatSize(file.size);}catch{if(status)status.textContent='Transfer interrupted';}finally{outgoing.delete(id);sending.delete(id);}}

function setTool(tool:string){state.tool=tool;document.querySelectorAll<HTMLElement>('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));stage.classList.toggle('pointer-mode',tool==='pointer');if(tool==='lock')toast('Tap a distinct detail to lock a target. Tracking works best with steady light and slow movement.');}
function pointerAction(){if(state.demo){setTool(state.tool==='pointer'?'direction':'pointer');toast('Preview: drag to show a shared pointer. In a call, the screen owner must allow it.');return;}if(state.pointerAllowed){state.pointerAllowed=false;packet({type:'pointer-permission',enabled:false});$('#remote-pointer').hidden=true;toast('Shared pointer revoked.');return;}if(!state.remoteSharing){toast('Shared pointer is available when your person shares their screen. It cannot control their desktop.');return;}if(state.remotePointerAllowed)setTool(state.tool==='pointer'?'direction':'pointer');else{packet({type:'pointer-request'});toast('Asking your person to allow a shared pointer…');}}
async function tiltEnable(){
 try {const ctor=DeviceOrientationEvent as typeof DeviceOrientationEvent & {requestPermission?:()=>Promise<string>};if(ctor.requestPermission&&await ctor.requestPermission()!=='granted'){toast('Motion permission wasn’t granted. Guidance still works without it.');return;}state.tilt=true;tiltBaseline=undefined;toast('Waiting for motion sensor data…');clearTimeout(sensorTimer);sensorTimer=setTimeout(()=>{if(!tiltBaseline){state.tilt=false;toast('No motion sensor detected. Touch guidance is still available.');}},4000);}catch{toast('Motion sensors are unavailable in this browser.');}
}
window.addEventListener('deviceorientation',e=>{if(!state.tilt||e.beta===null||e.gamma===null)return;if(!tiltBaseline){tiltBaseline={beta:e.beta,gamma:e.gamma};clearTimeout(sensorTimer);toast('Tilt guidance enabled. Keep your phone in this orientation to calibrate.');}const rotation=clamp(e.gamma-tiltBaseline.gamma,-35,35),pitch=clamp(e.beta-tiltBaseline.beta,-25,25);$('#direction-arrow').style.setProperty('--tilt',`${-rotation}deg`);$('#direction-arrow').style.setProperty('--pitch',`${35+pitch}deg`);if(!$('#direction-arrow').hidden)place($('#direction-arrow'),{x:clamp(arrowPoint.x-rotation/360),y:clamp(arrowPoint.y+pitch/360)});});

function helpDialog(){showDialog(`<div class="dialog-symbol">${icon('navigation')}</div><div class="eyebrow">A SECOND PAIR OF EYES</div><h2>Show it. Solve it. Together.</h2><p>From a tricky coffee machine to a fix under the hood, Near makes remote help feel a little more hands-on.</p><ol class="help-steps"><li><span>1</span><div><strong>Make a private call link</strong><p>Pick “I need a hand” to share your camera, or “I’m here to help” to guide someone else.</p></div></li><li><span>2</span><div><strong>Point the way</strong><p>The Guide drags on the video. Both people see the direction arrow. Release to ask the Camera to hold still.</p></div></li><li><span>3</span><div><strong>Get a closer look</strong><p>Ask them to come closer, zoom your own view, or lock a visual target. Chat and share files without leaving the call.</p></div></li></ol><div class="info-box">${icon('mouse-pointer-2')} A shared pointer works inside Near with permission. Browser security prevents remote desktop mouse control.</div><button class="button primary full-width" id="help-start">Let’s try it ${icon('arrow-right')}</button>`);$('#help-start').addEventListener('click',()=>{dialog.close();newCallDialog();});}
function privacyDialog(){showDialog(`<div class="dialog-symbol">${icon('shield-check')}</div><h2>Closer, with a little privacy.</h2><p>Connected calls use WebRTC’s mandatory media encryption (DTLS-SRTP) and encrypted data channels (DTLS). Encryption is always on.</p><div class="info-list"><p><strong>No recordings.</strong> Near does not record or save your media. Chat and received files stay in this tab until you clear or close it.</p><p><strong>Private invitation.</strong> A random secret is carried in the link fragment and checked over the data channel. The host still approves the person who joins. Share invitations privately.</p><p><strong>A server helps you meet.</strong> PeerJS Cloud handles signaling by default; STUN helps devices connect. A configured TURN relay may carry encrypted traffic. These services can see connection metadata. Peers can learn each other’s IP addresses.</p><p><strong>You stay in control.</strong> Microphone, camera, screen, motion sensors, and shared pointer require your permission. Files are only received when you accept them.</p></div><a class="external-link" href="https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels#security" target="_blank" rel="noopener noreferrer">Read about WebRTC security ↗</a>`);}
function settingsDialog(){let saved:Record<string,string>={};try{saved=JSON.parse(sessionStorage.getItem('near-network')||'{}');}catch{}showDialog(`<div class="dialog-symbol">${icon('sliders-horizontal')}</div><h2>Make yourself comfortable.</h2><p>Small adjustments for your device and connection.</p><div class="setting-line"><div><strong>Tilt-aware guidance</strong><small>Permission-based phone motion. Touch always works.</small></div><button class="button small" id="enable-tilt">${state.tilt?'Recalibrate':'Enable'}</button></div><div class="setting-line"><div><strong>Encryption</strong><small>WebRTC media and data encryption is always on.</small></div><span class="on-badge">${icon('lock-keyhole')} On</span></div><details class="network-settings"><summary>Connection & relay settings ${icon('chevron-down')}</summary><p>Apply before a call. A TURN server helps on restrictive mobile and workplace networks. Credentials stay in this tab’s session storage.</p><form id="network-form"><label class="field-label" for="turn-url">TURN server URL</label><input class="text-input" id="turn-url" placeholder="turns:relay.example.com:5349" value="${esc(saved.turn||'')}"/><div class="field-pair"><div><label class="field-label" for="turn-user">Username</label><input class="text-input" id="turn-user" autocomplete="off" value="${esc(saved.username||'')}"/></div><div><label class="field-label" for="turn-password">Credential</label><input class="text-input" id="turn-password" type="password" autocomplete="off" value="${esc(saved.credential||'')}"/></div></div><label class="field-label" for="signal-host">Custom PeerServer host (optional)</label><input class="text-input" id="signal-host" placeholder="signal.example.com" value="${esc(saved.host||'')}"/><div class="field-pair"><div><label class="field-label" for="signal-port">HTTPS port</label><input class="text-input" id="signal-port" type="number" min="1" max="65535" value="${esc(saved.port||'443')}"/></div><div><label class="field-label" for="signal-path">Path</label><input class="text-input" id="signal-path" placeholder="/" value="${esc(saved.path||'/')}"/></div></div><button class="button primary full-width" type="submit">Save for next call</button></form></details><button class="text-button danger-text" id="clear-chat">Clear this conversation</button>`);
 $('#enable-tilt').addEventListener('click',()=>void tiltEnable());$('#clear-chat').addEventListener('click',()=>{if(messageCount&&!confirm('Clear messages and received file links from this tab?'))return;$('#messages').replaceChildren();blobUrls.forEach(URL.revokeObjectURL);blobUrls.length=0;incoming.clear();messageCount=0;$('#chat-count').textContent='0';dialog.close();toast('Conversation cleared from this tab.');});
 $('#network-form').addEventListener('submit',e=>{e.preventDefault();const turn=$<HTMLInputElement>('#turn-url').value.trim(),host=$<HTMLInputElement>('#signal-host').value.trim();if(turn&&!/^turns?:[^\s]+$/.test(turn)){toast('Use a turn: or turns: URL.');return;}if(host&&!/^[a-zA-Z0-9.-]+$/.test(host)){toast('Enter a hostname without https:// or a path.');return;}sessionStorage.setItem('near-network',JSON.stringify({turn,username:$<HTMLInputElement>('#turn-user').value,credential:$<HTMLInputElement>('#turn-password').value,host,port:$<HTMLInputElement>('#signal-port').value,path:$<HTMLInputElement>('#signal-path').value||'/'}));toast('Connection settings saved for the next call.');dialog.close();});}

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode as Mode)));
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b=>b.addEventListener('click',()=>{if(state.role==='guide')setTool(b.dataset.tool!);}));
const actions:Record<string,()=>void>={
 new:()=>newCallDialog(), calls:()=>{if(state.invite&&!state.connected)showInvite();else stage.focus();}, help:helpDialog, privacy:privacyDialog, settings:settingsDialog,
 chat:()=>{const panel=$('#chat-panel');if(innerWidth<=1100)panel.classList.toggle('chat-open');else $<HTMLTextAreaElement>('#chat-input').focus();state.unread=0;$('#unread').hidden=true;$('#chat-unread').hidden=true;},
 role:()=>{if(state.demo){state.role=state.role==='guide'?'camera':'guide';clearGuidance();renderState();if(state.role==='camera')instruction('This is what the Camera sees. Your guide points the way.','camera',4000);}},
 closer:()=>{if(!state.demo&&!state.connected){toast('Connect to your person first.');return;}instruction('Move your camera a little closer.','zoom-in',4000);packet({type:'closer'});},
 hold:()=>{if(!state.demo&&!state.connected){toast('Connect to your person first.');return;}$('#direction-arrow').hidden=true;instruction('Perfect. Hold still here.');packet({type:'hold'});},
 pointer:pointerAction, clear:()=>clearGuidance(),
 'zoom-in':()=>{state.zoom=clamp(state.zoom+.25,1,3);applyZoom();},'zoom-out':()=>{state.zoom=clamp(state.zoom-.25,1,3);applyZoom();},
 mic:()=>{state.mic=!state.mic;localStream?.getAudioTracks().forEach(t=>t.enabled=state.mic);renderState();if(state.demo)toast(state.mic?'Microphone on in preview.':'Microphone muted in preview.');},camera:()=>void toggleCamera(),flip:()=>void flipCamera(),share:()=>void screenShare(),
 fullscreen:()=>{if(document.fullscreenElement)void document.exitFullscreen();else if(stage.requestFullscreen)void stage.requestFullscreen().catch(()=>toast('Fullscreen isn’t available in this browser.'));else toast('Turn your phone sideways for a larger view.');},
 end:()=>{if(state.demo){clearGuidance();toast('This is a preview. Start a call to connect with your person.');}else endSession();},
 emoji:()=>{$('#emoji-picker').hidden=!$('#emoji-picker').hidden;},attach:()=>$<HTMLInputElement>('#file-input').click()
};
document.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-action]');if(b)actions[b.dataset.action!]?.();});
document.addEventListener('fullscreenchange',()=>{stage.classList.toggle('is-fullscreen',!!document.fullscreenElement);});
window.addEventListener('beforeunload',()=>session?.close());
setInterval(()=>{if(!state.started)return;const s=Math.floor((Date.now()-state.started)/1000);$('#timer').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')} · Encrypted`;},1000);
renderState();if(invitation)newCallDialog(true);

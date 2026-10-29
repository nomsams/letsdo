import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

// Run the actual interface. Only call transport and device permissions are faked.
const bundle = await build({entryPoints:['src/main.ts'],bundle:true,write:false,format:'iife',loader:{'.css':'empty'},plugins:[{
 name:'test-transport',setup(b){b.onResolve({filter:/^\.\/connection$/},()=>({path:'transport',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`
 export class CallSession {
  accepted=false; peer={id:'host'}; connected=false;
  constructor(config,hooks,invitation){this.config=config;this.hooks=hooks;window.__session=this;window.__count=(window.__count||0)+1;const n=window.__count;queueMicrotask(()=>invitation?hooks.joined('Alex','camera','guided'):hooks.invite(location.origin+location.pathname+'#call=test-'+n+'&key='+'a'.repeat(64)));}
  accept(){this.accepted=true;} decline(){} close(){this.closed=true;} send(){} setStream(s){this.local=s;}
  async pauseVideo(paused){this.paused=paused;}
  async qualityStats(){return {received:200,lost:0,rtt:.05};}
  async replaceAudio(track){this.local.getAudioTracks().forEach(t=>this.local.removeTrack(t));if(track)this.local.addTrack(track);}
  async replaceVideo(track){this.local.getVideoTracks().forEach(t=>this.local.removeTrack(t));if(track)this.local.addTrack(track);}
 }
 `}));}
}]});
const source=bundle.outputFiles[0].text;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function app(nativeShare=false,appearance:{theme?:string;systemDark?:boolean;storageBlocked?:boolean;visualHeight?:number;devices?:'denied'|'allow'|'mic-denied'|'camera-denied'}={}){
 const win=new Window({url:'http://localhost:5173/',width:390,height:844,settings:{enableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 win.document.head.innerHTML='<meta name="theme-color" content="#f6f8fc">';
 win.document.body.innerHTML='<div id="app"></div>';
 if(appearance.visualHeight)Object.defineProperty(win,'visualViewport',{configurable:true,value:Object.assign(new win.EventTarget(),{height:appearance.visualHeight,offsetTop:0})});
 if(appearance.theme)win.localStorage.setItem('near-theme',appearance.theme);
 if(appearance.storageBlocked)Object.defineProperty(win,'localStorage',{get(){throw new Error('Storage blocked');}});
 const media={matches:!!appearance.systemDark},themeListeners:Array<()=>void>=[];
 Object.defineProperty(win,'matchMedia',{value:()=>({...media,get matches(){return media.matches;},addEventListener:(_type:string,listener:()=>void)=>themeListeners.push(listener)})});
 class Stream {tracks:any[];constructor(tracks:any[]=[]){this.tracks=[...tracks];}getTracks(){return [...this.tracks];}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}addTrack(t:any){this.tracks.push(t);}removeTrack(t:any){this.tracks=this.tracks.filter(x=>x!==t);}}
 Object.defineProperty(win,'MediaStream',{value:Stream});
 Object.defineProperty(win,'RTCPeerConnection',{value:class{}});
 const sources=new WeakMap<object,unknown>();
 Object.defineProperty(win.HTMLMediaElement.prototype,'srcObject',{configurable:true,get(){return sources.get(this)||null;},set(value){sources.set(this,value);}});
 let requests=0,video:unknown,copied='',shared='',policy=appearance.devices||'denied',captureGate:((constraints:any)=>Promise<any>)|undefined;
 const captured:any[]=[];
 Object.defineProperty(win.navigator,'mediaDevices',{value:{getUserMedia:async(c:{video:unknown;audio:unknown})=>{requests++;video=c.video;if(captureGate)return captureGate(c);const kind=c.audio?'audio':'video';if(policy==='denied'||kind==='audio'&&policy==='mic-denied'||kind==='video'&&policy==='camera-denied')throw new win.DOMException('Blocked for test','NotAllowedError');const track={kind,enabled:true,muted:false,readyState:'live',torch:false,getSettings(){return{facingMode:'environment'};},getCapabilities(){return{torch:true};},async applyConstraints(c:any){this.torch=c.advanced[0].torch;},stop(){this.readyState='ended';}};captured.push(track);return new Stream([track]);}}});
 Object.defineProperty(win.navigator,'clipboard',{value:{writeText:async(value:string)=>{copied=value;}}});
 Object.defineProperty(win.navigator,'share',{value:nativeShare?async(p:{url:string})=>{shared=p.url;}:undefined});
 win.HTMLMediaElement.prototype.play=async()=>{};
 win.HTMLCanvasElement.prototype.getContext=(()=>({drawImage(){},fillRect(){},getImageData(){return{data:new Uint8ClampedArray(144*4)};}})) as never;
 win.eval(source);
 const find=(selector:string)=>{const el=win.document.querySelector(selector);assert.ok(el,`Missing ${selector}`);return el as unknown as HTMLElement;};
 const click=(selector:string)=>find(selector).click();
 return{win,find,click,requests:()=>requests,video:()=>video,copied:()=>copied,shared:()=>shared,session:()=>Reflect.get(win,'__session'),stream:(tracks:any[]=[])=>new Stream(tracks),captured,holdCapture:(capture:typeof captureGate)=>{captureGate=capture;},devices:(value:typeof policy)=>{policy=value;},system:(dark:boolean)=>{media.matches=dark;themeListeners.forEach(listener=>listener());},close:async()=>{win.dispatchEvent(new win.Event('pagehide'));await win.happyDOM.close();}};
}

test('dark mode follows the device until changed, then remembers the choice across screens and reloads',async()=>{
 const a=app(false,{systemDark:true});try{
  assert.equal(a.win.document.documentElement.dataset.theme,'dark');assert.equal(a.find('.theme-toggle').getAttribute('aria-pressed'),'true');
  a.system(false);assert.equal(a.win.document.documentElement.dataset.theme,'light');
  a.click('#home-screen .theme-toggle');assert.equal(a.win.localStorage.getItem('near-theme'),'dark');a.system(false);assert.equal(a.win.document.documentElement.dataset.theme,'dark');
  a.click('[data-action="quick-start"]');await tick();const session=a.session();a.click('#lobby-screen .theme-toggle');
  assert.equal(a.win.document.documentElement.dataset.theme,'light');assert.equal(a.win.localStorage.getItem('near-theme'),'light');assert.equal(a.session(),session);assert.equal(a.requests(),0);
  const b=app(false,{systemDark:true,theme:a.win.localStorage.getItem('near-theme')!});try{assert.equal(b.win.document.documentElement.dataset.theme,'light');}finally{await b.close();}
 }finally{await a.close();}
});

test('the theme toggle still works when browser storage is blocked',async()=>{
 const a=app(false,{storageBlocked:true});try{
  assert.equal(a.win.document.documentElement.dataset.theme,'light');a.click('#home-screen .theme-toggle');
  assert.equal(a.win.document.documentElement.dataset.theme,'dark');assert.equal(a.win.document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),'#0b1120');
 }finally{await a.close();}
});

test('the front door contains no sample photo and one click creates a shareable call without hardware access',async()=>{
 const a=app();try{
  assert.equal(a.win.document.querySelector('img'),null);assert.equal(a.win.document.querySelector('[data-action="demo"]'),null);
  assert.equal(a.session(),undefined);assert.equal(a.requests(),0);
  a.click('[data-action="quick-start"]');await tick();
  assert.equal(a.win.document.body.classList.contains('is-lobby'),true);assert.equal(a.find('#invitation-card').hidden,false);
  assert.match((a.find('#invite-link') as HTMLInputElement).value,/#call=test-1&key=/);assert.equal(a.requests(),0);
  assert.equal(a.find('#dialog').hasAttribute('open'),false);assert.equal(a.find('#chat-panel').hidden,true);
 }finally{await a.close();}
});

test('copy and share preserve the entire private invitation, with a clipboard fallback',async()=>{
 for(const native of [false,true]){const a=app(native);try{
  a.click('[data-action="quick-start"]');await tick();const link=(a.find('#invite-link') as HTMLInputElement).value;
  a.click('[data-action="copy-invite"]');await tick();assert.equal(a.copied(),link);
  a.click('[data-action="share-invite"]');await tick();assert.equal(native?a.shared():a.copied(),link);
  assert.equal(a.find('#share-success').hidden,false);assert.equal(a.requests(),0);
 }finally{await a.close();}}
});

test('QR codes are generated on demand, downloadable, and cleared when a new call starts',async()=>{
 const a=app();try{
  a.click('[data-action="quick-start"]');await tick();assert.equal(a.find('#qr-panel').hidden,true);
  a.click('[data-action="qr"]');await tick();await tick();
  assert.equal(a.find('#qr-panel').hidden,false);assert.ok(a.find('#qr-image svg'));assert.equal((a.find('#save-qr') as HTMLButtonElement).disabled,false);
  a.click('[data-action="qr"]');assert.equal(a.find('#qr-panel').hidden,true);
  a.click('#lobby-screen [data-action="end"]');a.click('#leave-call');assert.equal(a.session().closed,true);
  a.click('[data-action="quick-start"]');await tick();assert.equal(a.find('#qr-panel').hidden,true);assert.equal(a.win.document.querySelector('#qr-image svg'),null);
  assert.match((a.find('#invite-link') as HTMLInputElement).value,/#call=test-2&key=/);assert.equal(a.requests(),0);
 }finally{await a.close();}
});

test('declining device permissions keeps the call alive with both devices off',async()=>{
 const a=app();try{
  a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');
  assert.equal(a.find('dialog h2').textContent,'Choose what to share');assert.equal(a.requests(),0);
  assert.equal(a.win.document.body.classList.contains('is-lobby'),false);
  a.click('[data-close]');assert.match(a.find('#next-title').textContent!,/camera and microphone/i);
  a.click('#next-action');a.click('#allow-media');await tick();await tick();
  assert.equal(a.requests(),2);assert.equal(a.win.document.body.classList.contains('is-home'),false);assert.equal(a.session().closed,undefined);assert.equal(a.session().local.getTracks().length,0);assert.equal(a.find('#device-notice').hidden,false);
  a.session().hooks.stream(a.stream());a.devices('allow');a.click('#mic-btn');await tick();await tick();
  assert.equal(a.session().local.getAudioTracks().length,1);assert.equal(a.find('#mic-btn').getAttribute('aria-pressed'),'true');assert.equal(a.session().closed,undefined);
 }finally{await a.close();}
});

test('voice calls and guided helpers request microphone-only access',async()=>{
 for(const options of [{mode:'voice',role:'camera'},{mode:'guided',role:'guide'}]){const a=app();try{
  (a.find('#home-mode') as HTMLSelectElement).value=options.mode;(a.find('#home-role') as HTMLSelectElement).value=options.role;
  a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');
  assert.equal(a.win.document.querySelector('#want-camera'),null);a.click('#allow-media');await tick();assert.equal(a.video(),false);assert.equal(a.session().closed,undefined);
 }finally{await a.close();}}
});

test('joining without devices never requests permission and either device can be enabled later',async()=>{
 const a=app(false,{devices:'allow'});try{
  a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#permission-cancel');await tick();
  assert.equal(a.requests(),0);assert.equal(a.session().local.getTracks().length,0);assert.equal(a.session().closed,undefined);
  a.session().hooks.stream(a.stream());a.click('#mic-btn');await tick();await tick();a.click('#camera-btn');await tick();await tick();
  assert.equal(a.session().local.getAudioTracks().length,1);assert.equal(a.session().local.getVideoTracks().length,1);assert.equal(a.session().closed,undefined);
 }finally{await a.close();}
});

test('a denied microphone does not discard an allowed camera',async()=>{
 const a=app(false,{devices:'mic-denied'});try{
  a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#allow-media');await tick();await tick();
  assert.equal(a.session().local.getAudioTracks().length,0);assert.equal(a.session().local.getVideoTracks().length,1);assert.equal(a.session().closed,undefined);
 }finally{await a.close();}
});

test('invalid pasted invitations do not connect and a valid invitation needs only Join call',async()=>{
 const a=app();try{
  a.click('[data-action="join-link"]');(a.find('#join-url') as HTMLInputElement).value='https://other.example/#call=x&key='+'a'.repeat(64);a.click('#join-link-form button');
  assert.equal(a.find('#join-error').hidden,false);assert.equal(a.session(),undefined);
  (a.find('#join-url') as HTMLInputElement).value='http://localhost:5173/#call=x&key='+'a'.repeat(64);a.click('#join-link-form button');
  await tick();assert.equal(a.win.document.querySelector('#your-name'),null);assert.equal(a.find('#dialog').hasAttribute('open'),false);
  assert.equal(a.win.document.body.classList.contains('is-lobby'),true);assert.equal(a.requests(),0);assert.ok(a.session());
 }finally{await a.close();}
});

test('messages stay closed until requested, manage keyboard focus, and close cleanly on disconnection',async()=>{
 const a=app();try{
  a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('[data-close]');
  assert.equal(a.find('#chat-panel').hidden,true);a.find('.chat-control').focus();a.click('.chat-control');
  assert.equal(a.find('#chat-panel').hidden,false);assert.equal(a.find('.call-column').inert,true);assert.equal(a.win.document.activeElement?.id,'chat-input');
  a.win.document.dispatchEvent(new a.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(a.find('#chat-panel').hidden,true);assert.equal(a.find('.call-column').inert,false);
  a.click('.chat-control');a.session().hooks.ended('Call ended. Your camera and microphone are off.');
  assert.equal(a.find('#chat-panel').hidden,true);assert.equal(a.find('.call-column').inert,false);assert.equal(a.win.document.body.classList.contains('is-home'),true);
 }finally{await a.close();}
});

test('device readiness shows a private preview and sends nothing until Join call is pressed',async()=>{
 const a=app(false,{devices:'allow'});try{
 a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#check-devices');await tick();await tick();
 assert.equal(a.find('dialog h2').textContent,'Ready to join?');assert.equal(a.session().local,undefined);assert.equal(a.requests(),2);assert.match(a.find('.readiness-list').textContent!,/Microphone ready/);assert.ok((a.find('#device-preview') as HTMLVideoElement).srcObject);
 a.click('#join-ready');assert.equal(a.session().local.getTracks().length,2);assert.equal(a.find('#dialog').hasAttribute('open'),false);
 }finally{await a.close();}
});
test('leaving during a permission prompt stops late tracks without affecting a new call',async()=>{
 const a=app(false,{devices:'allow'});let resolve!:(stream:any)=>void;const track={kind:'audio',readyState:'live',stop(){this.readyState='ended';}};try{
 a.holdCapture(()=>new Promise(r=>resolve=r));a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#allow-media');await tick();const old=a.session();a.click('.end-control');a.click('#leave-call');a.click('[data-action="quick-start"]');await tick();resolve(a.stream([track]));await tick();await tick();assert.equal(old.closed,true);assert.equal(track.readyState,'ended');assert.equal(a.session().closed,undefined);assert.equal(a.session().local,undefined);assert.equal(a.requests(),1);
 }finally{await a.close();}
});
test('larger controls are available and still work when storage is blocked',async()=>{
 const a=app(false,{storageBlocked:true});try{a.click('#home-screen [data-action="settings"]');a.click('#large-controls');assert.equal(a.win.document.documentElement.classList.contains('large-controls'),true);assert.equal(a.find('#large-controls').getAttribute('aria-pressed'),'true');a.click('#large-controls');assert.equal(a.win.document.documentElement.classList.contains('large-controls'),false);}finally{await a.close();}
});
test('audio-only mode pauses outgoing video without ending audio, and supported camera light toggles',async()=>{
 const a=app(false,{devices:'allow'});try{a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#allow-media');await tick();await tick();a.session().hooks.stream(a.stream());a.click('[data-action="more"]');a.click('#more-torch');await tick();assert.equal(a.captured.find(t=>t.kind==='video').torch,true);a.click('#audio-only-button');await tick();await tick();assert.equal(a.session().paused,true);assert.equal(a.session().local.getAudioTracks()[0].enabled,true);assert.equal(a.find('#audio-only-button').textContent,'Restore video');a.click('#audio-only-button');await tick();await tick();assert.equal(a.session().paused,false);}finally{await a.close();}
});
test('a failed screen-share replacement stops its captured track and leaves the call alive',async()=>{
 const a=app(false,{devices:'allow'});try{a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#allow-media');await tick();await tick();a.session().hooks.stream(a.stream());const screen={kind:'video',readyState:'live',stop(){this.readyState='ended';}};Object.defineProperty((a.win.navigator as unknown as Navigator).mediaDevices,'getDisplayMedia',{value:async()=>a.stream([screen])});a.session().replaceVideo=async()=>{throw Error('Replace failed');};a.click('[data-action="more"]');a.click('#more-share');await tick();await tick();assert.equal(screen.readyState,'ended');assert.equal(a.session().closed,undefined);}finally{await a.close();}
});

test('messages are kept as drafts during reconnection instead of appearing as sent',async()=>{
 const a=app(false,{devices:'allow'});try{a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#permission-cancel');await tick();a.session().hooks.stream(a.stream());a.click('.chat-control');(a.find('#chat-input') as HTMLTextAreaElement).value='Keep this draft';a.click('.send-button');assert.equal((a.find('#chat-input') as HTMLTextAreaElement).value,'Keep this draft');assert.equal(a.win.document.querySelector('.message'),null);a.session().connected=true;a.click('.send-button');assert.equal((a.find('#chat-input') as HTMLTextAreaElement).value,'');assert.match(a.find('.message').textContent!,/Keep this draft/);}finally{await a.close();}
});

test('malformed saved network settings do not crash Settings or call setup',async()=>{
 const a=app();try{a.win.sessionStorage.setItem('near-network','null');a.click('#home-screen [data-action="settings"]');assert.equal(a.find('dialog h2').textContent,'Call settings');a.click('[data-close]');a.click('[data-action="quick-start"]');await tick();assert.ok(a.session());assert.equal(a.find('#invitation-card').hidden,false);}finally{await a.close();}
});

test('leaving a page stops capture and returns a cached page to a disconnected state',async()=>{
 const a=app(false,{devices:'allow'});try{a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#allow-media');await tick();await tick();a.session().hooks.stream(a.stream());a.win.dispatchEvent(new a.win.Event('pagehide'));assert.equal(a.session().closed,true);assert.ok(a.captured.every(t=>t.readyState==='ended'));assert.equal(a.win.document.body.classList.contains('is-home'),true);}finally{await a.close();}
});

test('the visible guide choice creates a helper call and voice mode hides irrelevant role choices',async()=>{
 const a=app();try{a.click('[data-home-role="guide"]');assert.equal(a.find('[data-home-role="guide"]').getAttribute('aria-pressed'),'true');a.click('[data-action="quick-start"]');await tick();assert.equal(a.session().config.role,'guide');a.session().hooks.request('Alex');a.click('#accept-call');assert.equal(a.win.document.querySelector('#want-camera'),null);}finally{await a.close();}
 const b=app();try{(b.find('#home-mode') as HTMLSelectElement).value='voice';b.find('#home-mode').dispatchEvent(new b.win.Event('change',{bubbles:true}) as unknown as Event);assert.equal(b.find('.home-role-choice').hidden,true);}finally{await b.close();}
});

test('desktop invitations show a decodable QR automatically without requesting devices',async()=>{
 const a=app();try{Object.defineProperty(a.win,'innerWidth',{configurable:true,value:1024});a.click('[data-action="quick-start"]');await tick();await tick();await tick();assert.equal(a.find('#qr-panel').hidden,false);assert.equal(a.find('#qr-toggle').getAttribute('aria-expanded'),'true');assert.ok(a.find('#qr-image svg'));assert.equal(a.requests(),0);}finally{await a.close();}
});

test('screen sharing keeps its stop control enabled and restores the camera without ending audio',async()=>{
 const a=app(false,{devices:'allow'});try{const screen={kind:'video',readyState:'live',stop(){this.readyState='ended';}};Object.defineProperty((a.win.navigator as unknown as Navigator).mediaDevices,'getDisplayMedia',{value:async()=>a.stream([screen])});a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#allow-media');await tick();await tick();a.session().hooks.stream(a.stream());a.click('#share-btn');await tick();await tick();assert.equal(a.find('#share-btn').getAttribute('aria-pressed'),'true');assert.equal((a.find('#share-btn') as HTMLButtonElement).disabled,false);assert.equal(a.find('#tools-title').textContent,'Work on this screen');a.click('#share-btn');await tick();await tick();assert.equal(a.find('#share-btn').getAttribute('aria-pressed'),'false');assert.equal(screen.readyState,'ended');assert.equal(a.session().local.getAudioTracks()[0].readyState,'live');assert.equal(a.session().closed,undefined);}finally{await a.close();}
});

test('microphone shortcuts work during a call but never intercept typing or dialogs',async()=>{
 const a=app(false,{devices:'allow'});try{a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#allow-media');await tick();await tick();a.session().hooks.stream(a.stream());const mic=a.session().local.getAudioTracks()[0];a.win.document.body.dispatchEvent(new a.win.KeyboardEvent('keydown',{key:'m',bubbles:true}));assert.equal(mic.enabled,false);a.find('#chat-input').dispatchEvent(new a.win.KeyboardEvent('keydown',{key:'m',bubbles:true}) as unknown as Event);assert.equal(mic.enabled,false);a.click('[data-action="more"]');a.win.document.body.dispatchEvent(new a.win.KeyboardEvent('keydown',{key:'m',bubbles:true}));assert.equal(mic.enabled,false);a.click('[data-close]');a.win.document.body.dispatchEvent(new a.win.KeyboardEvent('keydown',{key:'m',bubbles:true}));assert.equal(mic.enabled,true);}finally{await a.close();}
});

test('the call brand opens call details without navigating away or stopping capture',async()=>{
 const a=app(false,{devices:'allow'});try{a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#allow-media');await tick();await tick();a.session().hooks.stream(a.stream());const active=a.session();a.click('.call-brand');assert.equal(a.find('dialog h2').textContent,'You’re connected.');assert.equal(a.session(),active);assert.equal(active.closed,undefined);assert.ok(a.captured.every(t=>t.readyState==='live'));}finally{await a.close();}
});

test('conversation stays inside the visible viewport when a mobile keyboard opens',async()=>{
 const a=app(false,{visualHeight:420});try{a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('[data-close]');a.click('.chat-control');assert.equal(a.find('#chat-panel').style.height,'404px');const viewport=Reflect.get(a.win,'visualViewport');viewport.height=260;viewport.dispatchEvent(new a.win.Event('resize'));assert.equal(a.find('#chat-panel').style.height,'244px');a.click('.chat-close');assert.equal(a.find('#chat-panel').style.height,'');assert.equal(a.find('#chat-panel').hidden,true);}finally{await a.close();}
});

test('routine pointer resets stay silent while explicit requests receive a clear answer',async()=>{
 const a=app();try{a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#permission-cancel');await tick();a.session().hooks.stream(a.stream());a.session().hooks.packet({type:'pointer-permission',enabled:false});assert.doesNotMatch(a.find('#toast').textContent!,/declined|stopped|isn.t enabled/i);a.session().hooks.packet({type:'screen',enabled:true});a.click('[data-action="pointer"]');a.session().hooks.packet({type:'pointer-permission',enabled:false});assert.match(a.find('#toast').textContent!,/request declined/i);assert.equal(a.session().closed,undefined);}finally{await a.close();}
});

test('sharing offers only supported actions and exposes the full link when clipboard access fails',async()=>{
 const a=app();try{a.click('[data-action="quick-start"]');await tick();assert.equal(a.find('[data-action="share-invite"]').hidden,true);assert.equal(a.find('[data-action="copy-invite"]').classList.contains('primary'),true);assert.equal((a.find('#invite-link-details') as HTMLDetailsElement).open,false);Object.assign(Reflect.get(a.win.navigator,'clipboard'),{writeText:async()=>{throw Error('Blocked');}});a.click('[data-action="copy-invite"]');await tick();assert.equal((a.find('#invite-link-details') as HTMLDetailsElement).open,true);assert.equal(a.win.document.activeElement?.id,'invite-link');assert.match(a.find('#share-success').textContent!,/selected link/i);}finally{await a.close();}
 const b=app(true);try{b.click('[data-action="quick-start"]');await tick();assert.equal(b.find('[data-action="share-invite"]').hidden,false);}finally{await b.close();}
});

test('extra guidance is folded until needed and selecting tracking returns focus to the camera',async()=>{
 const a=app();try{a.click('[data-home-role="guide"]');a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#permission-cancel');await tick();a.session().hooks.stream(a.stream());const menu=a.find('#extra-guidance') as HTMLDetailsElement;assert.equal(menu.hidden,false);assert.equal(menu.open,false);menu.open=true;a.click('#select-item-button');assert.equal(menu.open,false);assert.equal(a.find('#select-item-button').getAttribute('aria-pressed'),'true');assert.equal(a.win.document.activeElement?.id,'stage');a.click('[data-tool="direction"]');assert.equal(menu.classList.contains('has-selection'),false);}finally{await a.close();}
});

test('call options omit unavailable devices and voice calls hide camera tools',async()=>{
 const a=app();try{Object.defineProperty(a.win.document,'fullscreenEnabled',{configurable:true,value:false});(a.find('#home-mode') as HTMLSelectElement).value='voice';a.click('[data-action="quick-start"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');a.click('#permission-cancel');await tick();a.session().hooks.stream(a.stream());assert.equal(a.find('.assistance-panel').hidden,true);a.click('[data-action="more"]');assert.equal(a.find('dialog h2').textContent,'Call options');for(const id of ['more-share','more-flip','more-torch','more-audio','more-fullscreen'])assert.equal(a.win.document.getElementById(id),null);assert.ok(a.find('#more-settings'));}finally{await a.close();}
});

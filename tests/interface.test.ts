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
  async replaceAudio(track){this.local.getAudioTracks().forEach(t=>this.local.removeTrack(t));if(track)this.local.addTrack(track);}
  async replaceVideo(track){this.local.getVideoTracks().forEach(t=>this.local.removeTrack(t));if(track)this.local.addTrack(track);}
 }
 `}));}
}]});
const source=bundle.outputFiles[0].text;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function app(nativeShare=false,appearance:{theme?:string;systemDark?:boolean;storageBlocked?:boolean;devices?:'denied'|'allow'|'mic-denied'|'camera-denied'}={}){
 const win=new Window({url:'http://localhost:5173/',width:390,height:844,settings:{enableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 win.document.head.innerHTML='<meta name="theme-color" content="#f6f8fc">';
 win.document.body.innerHTML='<div id="app"></div>';
 if(appearance.theme)win.localStorage.setItem('near-theme',appearance.theme);
 if(appearance.storageBlocked)Object.defineProperty(win,'localStorage',{get(){throw new Error('Storage blocked');}});
 const media={matches:!!appearance.systemDark},themeListeners:Array<()=>void>=[];
 Object.defineProperty(win,'matchMedia',{value:()=>({...media,get matches(){return media.matches;},addEventListener:(_type:string,listener:()=>void)=>themeListeners.push(listener)})});
 class Stream {tracks:any[];constructor(tracks:any[]=[]){this.tracks=[...tracks];}getTracks(){return [...this.tracks];}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}addTrack(t:any){this.tracks.push(t);}removeTrack(t:any){this.tracks=this.tracks.filter(x=>x!==t);}}
 Object.defineProperty(win,'MediaStream',{value:Stream});
 const sources=new WeakMap<object,unknown>();
 Object.defineProperty(win.HTMLMediaElement.prototype,'srcObject',{configurable:true,get(){return sources.get(this)||null;},set(value){sources.set(this,value);}});
 let requests=0,video:unknown,copied='',shared='',policy=appearance.devices||'denied';
 Object.defineProperty(win.navigator,'mediaDevices',{value:{getUserMedia:async(c:{video:unknown;audio:unknown})=>{requests++;video=c.video;const kind=c.audio?'audio':'video';if(policy==='denied'||kind==='audio'&&policy==='mic-denied'||kind==='video'&&policy==='camera-denied')throw new win.DOMException('Blocked for test','NotAllowedError');return new Stream([{kind,enabled:true,muted:false,readyState:'live',stop(){this.readyState='ended';}}]);}}});
 Object.defineProperty(win.navigator,'clipboard',{value:{writeText:async(value:string)=>{copied=value;}}});
 Object.defineProperty(win.navigator,'share',{value:nativeShare?async(p:{url:string})=>{shared=p.url;}:undefined});
 win.HTMLMediaElement.prototype.play=async()=>{};
 win.HTMLCanvasElement.prototype.getContext=(()=>({drawImage(){},fillRect(){},getImageData(){return{data:new Uint8ClampedArray(144*4)};}})) as never;
 win.eval(source);
 const find=(selector:string)=>{const el=win.document.querySelector(selector);assert.ok(el,`Missing ${selector}`);return el as unknown as HTMLElement;};
 const click=(selector:string)=>find(selector).click();
 return{win,find,click,requests:()=>requests,video:()=>video,copied:()=>copied,shared:()=>shared,session:()=>Reflect.get(win,'__session'),stream:()=>new Stream(),devices:(value:typeof policy)=>{policy=value;},system:(dark:boolean)=>{media.matches=dark;themeListeners.forEach(listener=>listener());},close:()=>win.happyDOM.abort()};
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
  assert.match(a.find('dialog h2').textContent!,/Join this call/i);assert.equal(a.win.document.querySelector('#your-name'),null);
  a.click('#join-call');await tick();assert.equal(a.win.document.body.classList.contains('is-lobby'),true);assert.equal(a.requests(),0);
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

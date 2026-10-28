import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

// Exercise the real interface in a DOM sandbox. Only transport and hardware are faked.
const bundle = await build({entryPoints:['src/main.ts'],bundle:true,write:false,format:'iife',loader:{'.css':'empty'},plugins:[{
 name:'test-transport',setup(b){b.onResolve({filter:/^\.\/connection$/},()=>({path:'transport',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`
 export class CallSession {
  accepted=false; peer={id:'host'}; connected=false;
  constructor(config,hooks,invitation){this.config=config;this.hooks=hooks;window.__session=this;queueMicrotask(()=>invitation?hooks.joined('Alex','camera','guided'):hooks.invite(location.origin+location.pathname+'#call=test&key='+'a'.repeat(64)));}
  accept(){this.accepted=true;} decline(){} close(){this.closed=true;} send(){} setStream(s){this.local=s;}
 }
 `}));}
}]});
const source=bundle.outputFiles[0].text;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function app(){
 const win=new Window({url:'http://localhost:5173/',width:390,height:844,settings:{enableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 win.document.body.innerHTML='<div id="app"></div>';
 let requests=0,video:unknown;
 Object.defineProperty(win.navigator,'mediaDevices',{value:{getUserMedia:async(c:{video:unknown})=>{requests++;video=c.video;throw new win.DOMException('Blocked for test','NotAllowedError');}}});
 win.HTMLMediaElement.prototype.play=async()=>{};
 win.HTMLCanvasElement.prototype.getContext=(()=>({drawImage(){},fillRect(){},getImageData(){return{data:new Uint8ClampedArray(144*4)};}})) as never;
 win.eval(source);
 const find=(selector:string)=>{const el=win.document.querySelector(selector);assert.ok(el,`Missing ${selector}`);return el as unknown as HTMLElement;};
 const click=(selector:string)=>find(selector).click();
 return{win,find,click,requests:()=>requests,video:()=>video,session:()=>Reflect.get(win,'__session'),close:()=>win.happyDOM.abort()};
}

test('no signup or hardware access is needed to create an invitation; media waits for a separate consent action',async()=>{
 const a=app();try{
  assert.equal(a.win.document.body.classList.contains('is-home'),true);assert.equal(a.session(),undefined);assert.equal(a.requests(),0);
  a.click('[data-action="need-help"]');assert.match(a.find('dialog h2').textContent!,/get you a hand/i);
  a.click('#start-form button[type="submit"]');await tick();
  assert.equal(a.win.document.body.classList.contains('is-home'),false);assert.match(a.find('dialog h2').textContent!,/Send this/i);assert.equal(a.requests(),0);
  a.session().hooks.request('Alex');a.click('#accept-call');assert.match(a.find('dialog h2').textContent!,/camera and microphone/i);assert.equal(a.requests(),0);
  a.click('[data-close]');assert.match(a.find('#next-title').textContent!,/camera and microphone/i);
  a.click('#next-action');a.click('#allow-media');await tick();await tick();
  assert.equal(a.requests(),1);assert.equal(a.win.document.body.classList.contains('is-home'),true);assert.match(a.find('#result-title').textContent!,/blocked/i);assert.equal(a.session().closed,true);
 }finally{await a.close();}
});

test('helping someone uses microphone-only permission and voice calls never request a camera',async()=>{
 const a=app();try{
  a.click('[data-action="give-help"]');assert.match(a.find('dialog h2').textContent!,/help them out/i);
  a.click('#start-form button[type="submit"]');await tick();a.session().hooks.request('Alex');a.click('#accept-call');
  assert.equal(a.find('dialog h2').textContent,'Turn on your microphone');a.click('#allow-media');await tick();
  assert.equal(a.video(),false);
 }finally{await a.close();}
 const b=app();try{
  b.click('[data-action="need-help"]');(b.find('input[value="voice"]') as HTMLInputElement).checked=true;
  b.click('#start-form button[type="submit"]');await tick();b.session().hooks.request('Alex');b.click('#accept-call');b.click('#allow-media');await tick();
  assert.equal(b.video(),false);
 }finally{await b.close();}
});

test('practice mode stays offline, explains controls, and lets the user return home',async()=>{
 const a=app();try{
  a.click('[data-action="demo"]');assert.equal(a.session(),undefined);assert.equal(a.requests(),0);
  assert.equal((a.find('#mic-btn') as HTMLButtonElement).disabled,true);assert.equal((a.find('#camera-btn') as HTMLButtonElement).disabled,true);
  a.click('[data-action="guide-more"]');assert.equal(a.find('.more-guide').getAttribute('aria-expanded'),'true');
  a.click('[data-action="guide-more"]');assert.equal(a.find('.more-guide').getAttribute('aria-expanded'),'false');
  a.click('.end-control');assert.equal(a.win.document.body.classList.contains('is-home'),true);
 }finally{await a.close();}
});

test('invalid pasted links get an inline explanation without starting a connection',async()=>{
 const a=app();try{
  a.click('[data-action="join-link"]');(a.find('#join-url') as HTMLInputElement).value='https://other.example/#call=x&key='+'a'.repeat(64);a.click('#join-link-form button');
  assert.equal(a.find('#join-error').hidden,false);assert.equal(a.session(),undefined);
  (a.find('#join-url') as HTMLInputElement).value='http://localhost:5173/#call=x&key='+'a'.repeat(64);a.click('#join-link-form button');
  assert.match(a.find('dialog h2').textContent!,/one step away/i);assert.equal(a.requests(),0);
 }finally{await a.close();}
});

test('phone messages manage focus and Escape returns the user to their call controls',async()=>{
 const a=app();try{
  a.click('[data-action="demo"]');a.find('.chat-control').focus();a.click('.chat-control');
  assert.equal(a.find('#chat-panel').getAttribute('aria-modal'),'true');assert.equal(a.find('.call-column').inert,true);assert.equal(a.win.document.activeElement?.id,'chat-input');
  a.win.document.dispatchEvent(new a.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(a.find('#chat-panel').classList.contains('chat-open'),false);assert.equal(a.find('.call-column').inert,false);assert.equal(a.win.document.activeElement?.classList.contains('chat-control'),true);
 }finally{await a.close();}
});

test('cancel confirmation preserves the invitation, and a disconnected call releases the messages overlay',async()=>{
 const a=app();try{
  a.click('[data-action="need-help"]');a.click('#start-form button[type="submit"]');await tick();a.click('[data-close]');
  a.click('.end-control');assert.match(a.find('dialog h2').textContent!,/Cancel this call/i);a.click('#stay-call');assert.equal(a.session().closed,undefined);
  a.click('.chat-control');assert.equal(a.find('.call-column').inert,true);
  a.session().hooks.ended('Call ended. Your camera and microphone are off.');
  assert.equal(a.find('.call-column').inert,false);assert.equal(a.find('#chat-panel').classList.contains('chat-open'),false);
  assert.equal(a.win.document.body.classList.contains('is-home'),true);
  a.click('[data-action="demo"]');assert.equal(a.find('.call-column').inert,false);
 }finally{await a.close();}
});

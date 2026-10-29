import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { build } from 'esbuild';

class Data extends EventEmitter {open=true;peer='guest';sent:any[]=[];closed=false;throws=false;send(p:any){if(this.throws)throw Error('Channel closed');this.sent.push(p);}close(){if(this.closed)return;this.closed=true;this.open=false;this.emit('close');}}
class Peer extends EventEmitter {static latest:Peer;destroyed=false;disconnected=false;reconnects=0;outgoing=new Data();constructor(){super();Peer.latest=this;}connect(){return this.outgoing;}destroy(){this.destroyed=true;this.emit('disconnected');}reconnect(){this.reconnects++;this.disconnected=false;this.emit('open','host');}}
Object.defineProperty(globalThis,'__nearTestPeer',{configurable:true,value:Peer});
const bundle=await build({entryPoints:['src/connection.ts'],bundle:true,format:'esm',write:false,plugins:[{name:'fake-peer',setup(b){b.onResolve({filter:/^peerjs$/},()=>({path:'peer',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export default globalThis.__nearTestPeer;'}));}}]});
const {CallSession}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const key='a'.repeat(64);
function setup(guest=false){const ended:string[]=[],invites:string[]=[],requests:string[]=[];const hooks={status(){},invite:(s:string)=>invites.push(s),request:(s:string)=>requests.push(s),joined(){},packet(){},stream(){},ended:(s:string)=>ended.push(s)};const call=new CallSession({name:'Test',role:'camera',mode:'guided',iceServers:[]},hooks,guest?{peer:'host',token:key}:undefined);return{call,peer:Peer.latest,ended,invites,requests};}
function hello(call:any,data:Data){data.emit('data',{type:'hello',token:call.token,name:'Guest',protocol:3});}

test('late peer and data events after hangup cannot recreate the call or invitation',()=>{
 const {call,peer,invites,requests,ended}=setup();call.close();peer.emit('open','late');const data=new Data();peer.emit('connection',data);data.emit('open');data.emit('data',{type:'hello',token:call.token,name:'Late',protocol:3});assert.deepEqual(invites,[]);assert.deepEqual(requests,[]);assert.deepEqual(ended,[]);assert.equal(data.closed,true);
});
test('a rejected stale connection cannot terminate a later authenticated call',()=>{
 const {call,peer,ended,requests}=setup();try{const bad=new Data();peer.emit('connection',bad);bad.emit('data',{type:'hello',token:key,name:'Wrong',protocol:3});const good=new Data();peer.emit('connection',good);hello(call,good);assert.deepEqual(requests,['Guest']);bad.emit('error',new Error('Stale'));bad.emit('close');assert.deepEqual(ended,[]);assert.equal(call.data,good);}finally{call.close();}
});
test('send failures end the session once and release resources without recursive exceptions',()=>{
 const {call,peer,ended}=setup();const data=new Data();peer.emit('connection',data);hello(call,data);data.throws=true;assert.doesNotThrow(()=>call.send({type:'chat',text:'Hello'}));assert.equal(ended.length,1);assert.equal(peer.destroyed,true);assert.doesNotThrow(()=>call.close());assert.equal(ended.length,1);
});
test('a guest is notified when a data connection closes before authentication',()=>{
 const {call,peer,ended}=setup(true);peer.emit('open','guest');peer.outgoing.close();assert.equal(ended.length,1);assert.equal(peer.destroyed,true);call.close();
});
test('signaling failures preserve an active data connection and do not reconnect after hangup',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {call,peer,ended}=setup();const data=new Data();peer.emit('connection',data);hello(call,data);peer.disconnected=true;peer.emit('disconnected');peer.emit('error',{type:'network'});assert.deepEqual(ended,[]);call.close();t.mock.timers.tick(20000);await tick();assert.equal(peer.reconnects,0);assert.deepEqual(ended,[]);
});

test('an accepted caller reconnects the same person without a new invitation or approval',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {call,peer,ended,requests}=setup();let restarts=0;const data=new Data();peer.emit('connection',data);hello(call,data);call.accept();call.local={getTracks:()=>[]};call.media={pc:{connectionState:'connected'},offer:async(restart:boolean)=>{assert.equal(restart,true);restarts++;},close(){}};
 data.close();assert.equal(call.connected,false);const replacement=new Data();peer.emit('connection',replacement);hello(call,replacement);await tick();assert.equal(call.connected,true);assert.equal(restarts,1);assert.deepEqual(requests,['Guest']);assert.deepEqual(ended,[]);assert.ok(replacement.sent.some(p=>p.type==='accepted'));assert.ok(replacement.sent.some(p=>p.type==='ready'));call.close();t.mock.timers.tick(60000);assert.deepEqual(ended,[]);
});
test('a joining device retries its connection with the original invitation and never repeats media consent',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {call,peer,ended}=setup(true);peer.emit('open','guest');const welcome={type:'welcome',name:'Host',role:'camera',mode:'guided',protocol:3};peer.outgoing.emit('data',welcome);peer.outgoing.emit('data',{type:'accepted'});call.local={getTracks:()=>[]};peer.outgoing.close();peer.outgoing=new Data();t.mock.timers.tick(2000);peer.outgoing.emit('open');assert.equal(peer.outgoing.sent[0].token,key);peer.outgoing.emit('data',welcome);assert.equal(call.connected,true);assert.ok(peer.outgoing.sent.some(p=>p.type==='ready'));assert.deepEqual(ended,[]);call.close();await tick();
});
test('unrecoverable calls stop retrying and release devices after the recovery deadline',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {call,peer,ended}=setup();const data=new Data();peer.emit('connection',data);hello(call,data);call.accept();let stopped=false;call.local={getTracks:()=>[{stop(){stopped=true;}}]};data.close();t.mock.timers.tick(45000);assert.equal(ended.length,1);assert.equal(stopped,true);assert.equal(peer.destroyed,true);call.close();
});

test('a peer can recover a half-open path but must authenticate the replacement channel again',()=>{
 const {call,peer,ended,requests}=setup();const old=new Data();peer.emit('connection',old);hello(call,old);call.accept();const replacement=new Data();peer.emit('connection',replacement);assert.equal(old.closed,true);assert.equal(call.connected,false);assert.deepEqual(requests,['Guest']);hello(call,replacement);assert.equal(call.connected,true);assert.deepEqual(requests,['Guest']);assert.deepEqual(ended,[]);call.close();
});

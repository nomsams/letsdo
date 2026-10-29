import test from 'node:test';
import assert from 'node:assert/strict';
import { captureDevices } from '../src/media.ts';
class Stream { tracks:any[]=[];addTrack(t:any){this.tracks.push(t);}getTracks(){return this.tracks;} }
test('mic rejection and camera acceptance are independent and do not discard successful media',async()=>{
 const target=new Stream(),camera={kind:'video',stop(){}};const requests:MediaStreamConstraints[]=[];
 const devices={getUserMedia:async(c:MediaStreamConstraints)=>{requests.push(c);if(c.audio)throw Object.assign(new Error('Denied'),{name:'NotAllowedError'});return {getTracks:()=>[camera]};}};
 const errors=await captureDevices(target as unknown as MediaStream,{audio:true,video:{}},()=>true,devices as unknown as MediaDevices);
 assert.deepEqual(errors,[{kind:'audio',name:'NotAllowedError'}]);assert.deepEqual(target.tracks,[camera]);assert.equal(requests.length,2);
});
test('joining with devices off performs no hardware calls',async()=>{
 let calls=0;const errors=await captureDevices(new Stream() as unknown as MediaStream,{audio:false,video:false},()=>true,{getUserMedia:async()=>{calls++;throw new Error('Unexpected');}} as unknown as MediaDevices);
 assert.equal(calls,0);assert.deepEqual(errors,[]);
});
test('capture results arriving after hangup are stopped and never attached',async()=>{
 let active=true,stopped=false;const target=new Stream();
 const devices={getUserMedia:async()=>{active=false;return{getTracks:()=>[{stop(){stopped=true;}}]};}};
 await captureDevices(target as unknown as MediaStream,{audio:true,video:false},()=>active,devices as unknown as MediaDevices);
 assert.equal(stopped,true);assert.equal(target.tracks.length,0);
});

test('nonstandard device failures are reported without throwing or preventing a receive-only join',async()=>{
 const errors=await captureDevices(new Stream() as unknown as MediaStream,{audio:true,video:{}},()=>true,{getUserMedia:async()=>{throw null;}} as unknown as MediaDevices);
 assert.deepEqual(errors,[{kind:'audio',name:'NotReadableError'},{kind:'video',name:'NotReadableError'}]);
});

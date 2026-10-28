import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaTransport } from '../src/rtc.ts';
class Stream {
 tracks:any[]=[];getTracks(){return this.tracks;}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}addTrack(t:any){this.tracks.push(t);}removeTrack(t:any){this.tracks=this.tracks.filter(x=>x!==t);}
}
class PC {
 connectionState='new';localDescription:any;remoteDescription:any;slots:any[]=[];ice:any[]=[];
 onicecandidate:any;ontrack:any;onconnectionstatechange:any;
 addTransceiver(track:any,init:any){const slot={kind:typeof track==='string'?track:track.kind,direction:init.direction,sender:{track:typeof track==='string'?null:track,replaceTrack:async(t:any)=>{slot.sender.track=t;}}};this.slots.push(slot);return slot;}
 async createOffer(){return{type:'offer',sdp:'v=0\r\n'};}async createAnswer(){return{type:'answer',sdp:'v=0\r\n'};}
 async setLocalDescription(s:any){this.localDescription=s;}async setRemoteDescription(s:any){this.remoteDescription=s;}
 async addIceCandidate(c:any){assert.ok(this.remoteDescription);this.ice.push(c);}close(){this.connectionState='closed';}
}
test('empty-device calls negotiate real receive slots, connect, and enable tracks without renegotiating',async()=>{
 const beforeMedia=Object.getOwnPropertyDescriptor(globalThis,'MediaStream'),beforePC=Object.getOwnPropertyDescriptor(globalThis,'RTCPeerConnection');
 Object.defineProperty(globalThis,'MediaStream',{configurable:true,value:Stream});Object.defineProperty(globalThis,'RTCPeerConnection',{configurable:true,value:PC});
 try{
  const local=new Stream(),sent:any[]=[],received:any[]=[];
  const transport=new MediaTransport(local as unknown as MediaStream,[],{send:p=>sent.push(p),stream:s=>received.push(s),error:assert.fail});
  const pc=transport.pc as unknown as PC;assert.deepEqual(pc.slots.map(s=>[s.kind,s.direction,s.sender.track]),[['audio','sendrecv',null],['video','sendrecv',null]]);
  await transport.offer();assert.equal(sent[0].type,'rtc-offer');
  await transport.signal({type:'rtc-ice',candidate:{candidate:'candidate:test',sdpMid:'0'}});assert.equal(pc.ice.length,0);
  await transport.signal({type:'rtc-answer',sdp:'v=0\r\n'});assert.equal(pc.ice.length,1);
  pc.connectionState='connected';pc.onconnectionstatechange();assert.equal(received.length,1);assert.equal(received[0].getTracks().length,0);
  const audio={kind:'audio'},video={kind:'video'};await transport.replace('audio',audio as MediaStreamTrack);await transport.replace('video',video as MediaStreamTrack);
  assert.equal(pc.slots[0].sender.track,audio);assert.equal(pc.slots[1].sender.track,video);assert.equal(local.getTracks().length,2);assert.equal(sent.length,1);
  await transport.replace('video',null);assert.equal(pc.slots[1].sender.track,null);assert.equal(local.getVideoTracks().length,0);transport.close();assert.equal(pc.connectionState,'closed');
 }finally{if(beforeMedia)Object.defineProperty(globalThis,'MediaStream',beforeMedia);else Reflect.deleteProperty(globalThis,'MediaStream');if(beforePC)Object.defineProperty(globalThis,'RTCPeerConnection',beforePC);else Reflect.deleteProperty(globalThis,'RTCPeerConnection');}
});

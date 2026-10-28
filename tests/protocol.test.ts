import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteFromHash, validPacket, fitRect, normalizedPoint, FileAssembly, MAX_FILE, safeFilename, createInvitationUrl } from '../src/protocol.ts';
test('invitation requires a complete unguessable key and a safe peer ID',()=>{
 const key='a'.repeat(64);
 assert.deepEqual(inviteFromHash(`#call=peer-123&key=${key}`),{peer:'peer-123',token:key});
 for(const hash of ['#call=p&key=abc',`#call=<script>&key=${key}`,`#key=${key}`,''])assert.equal(inviteFromHash(hash),null);
});
test('local previews generate phone-usable hosted invitations while deployed sites keep their own address',()=>{
 const key='a'.repeat(64),published='https://nomsams.github.io/letsdo/';
 const local=new URL(createInvitationUrl('peer-1',key,'http://localhost:5173/',published));
 assert.equal(local.origin,'https://nomsams.github.io');assert.equal(local.pathname,'/letsdo/');assert.deepEqual(inviteFromHash(local.hash),{peer:'peer-1',token:key});assert.equal(local.search,'');
 const custom=new URL(createInvitationUrl('peer-1',key,'https://custom.example/app/',published));assert.equal(custom.origin,'https://custom.example');assert.equal(custom.pathname,'/app/');
});
test('only bounded valid messages enter the call protocol',()=>{
 assert.equal(validPacket({type:'arrow',x:.5,y:.5,dx:-.3,dy:.2}),true);
 for(const p of [{type:'arrow',x:NaN,y:1,dx:0,dy:1},{type:'arrow',x:1,y:1,dx:Infinity,dy:0},{type:'chat',text:'a'.repeat(4001)},{type:'file-offer',id:'1',name:'x',size:MAX_FILE+1},{type:'file-chunk',id:'1',data:new ArrayBuffer(17000)},{type:'unknown'},null])assert.equal(validPacket(p),false);
});
test('media signaling is bounded and rejects malformed SDP and ICE payloads',()=>{
 assert.equal(validPacket({type:'rtc-offer',sdp:'v=0\r\n'}),true);
 assert.equal(validPacket({type:'rtc-ice',candidate:{candidate:'candidate:test',sdpMid:'0',sdpMLineIndex:0}}),true);
 for(const p of [{type:'rtc-answer',sdp:'not SDP'},{type:'rtc-offer',sdp:'v=0'+'x'.repeat(65536)},{type:'rtc-ice',candidate:{candidate:'x',sdpMLineIndex:-1}},{type:'rtc-ice',candidate:{candidate:'x'.repeat(5000)}},{type:'rtc-ice',candidate:null}])assert.equal(validPacket(p),false);
});
test('video coordinates preserve aspect ratio and clamp off-canvas gestures',()=>{
 assert.deepEqual(fitRect(100,100,200,100),{left:0,top:25,width:100,height:50});
 assert.deepEqual(normalizedPoint(150,-50,{left:0,top:0,width:100,height:100}),{x:1,y:0});
});
test('file assembly rejects incomplete, oversized, and overflowing transfers',async()=>{
 assert.throws(()=>new FileAssembly(MAX_FILE+1));
 const f=new FileAssembly(3);f.append(new Uint8Array([1,2]).buffer);assert.throws(()=>f.finish());assert.throws(()=>f.append(new ArrayBuffer(2)));f.append(new Uint8Array([3]).buffer);assert.deepEqual([...new Uint8Array(await f.finish().arrayBuffer())],[1,2,3]);
 assert.equal(safeFilename('../../<bad>.html'),'.._..__bad_.html');
});

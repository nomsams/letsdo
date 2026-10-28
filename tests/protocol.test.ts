import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteFromHash, validPacket, fitRect, normalizedPoint, FileAssembly, MAX_FILE, safeFilename } from '../src/protocol.ts';
test('invitation requires a complete unguessable key and a safe peer ID',()=>{
 const key='a'.repeat(64);
 assert.deepEqual(inviteFromHash(`#call=peer-123&key=${key}`),{peer:'peer-123',token:key});
 for(const hash of ['#call=p&key=abc',`#call=<script>&key=${key}`,`#key=${key}`,''])assert.equal(inviteFromHash(hash),null);
});
test('only bounded valid messages enter the call protocol',()=>{
 assert.equal(validPacket({type:'arrow',x:.5,y:.5,dx:-.3,dy:.2}),true);
 for(const p of [{type:'arrow',x:NaN,y:1,dx:0,dy:1},{type:'arrow',x:1,y:1,dx:Infinity,dy:0},{type:'chat',text:'a'.repeat(4001)},{type:'file-offer',id:'1',name:'x',size:MAX_FILE+1},{type:'file-chunk',id:'1',data:new ArrayBuffer(17000)},{type:'unknown'},null])assert.equal(validPacket(p),false);
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

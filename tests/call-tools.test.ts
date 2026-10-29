import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotReceiver, snapshotPackets, connectionQuality, MAX_SNAPSHOT } from '../src/call-tools.ts';
import { validPacket, CHUNK_SIZE } from '../src/protocol.ts';

test('a shared paused frame is split into bounded packets and assembled byte for byte', async () => {
 const bytes=new Uint8Array(CHUNK_SIZE*2+103);bytes.forEach((_,i)=>bytes[i]=i%251);
 const receiver=new SnapshotReceiver(),packets=snapshotPackets('frame-1',bytes.buffer);
 for(const packet of packets){assert.equal(validPacket(packet),true);if(packet.type==='snapshot-start')receiver.start(String(packet.id),Number(packet.size));else if(packet.type==='snapshot-chunk')receiver.append(String(packet.id),packet.data as ArrayBuffer);}
 assert.deepEqual(new Uint8Array(await receiver.finish('frame-1')!.arrayBuffer()),bytes);
 assert.equal(receiver.finish('frame-1'),null);
});
test('incomplete, overflowing, stale and oversized paused frames cannot replace the current picture',()=>{
 const receiver=new SnapshotReceiver();assert.equal(receiver.start('x',MAX_SNAPSHOT+1),false);
 receiver.start('new',3);receiver.append('old',new ArrayBuffer(3));assert.equal(receiver.finish('old'),null);
 receiver.append('new',new ArrayBuffer(3));assert.ok(receiver.finish('new'));
 receiver.start('x',3);receiver.append('x',new ArrayBuffer(4));assert.equal(receiver.finish('x'),null);
 receiver.start('x',3);receiver.append('x',new ArrayBuffer(2));assert.equal(receiver.finish('x'),null);
 receiver.start('x',3);receiver.clear();receiver.append('x',new ArrayBuffer(3));assert.equal(receiver.finish('x'),null);
 assert.throws(()=>snapshotPackets('x',new ArrayBuffer(MAX_SNAPSHOT+1)));
});
test('quality is based on recent packet loss and latency, and recovers after historical loss',()=>{
 assert.equal(connectionQuality({received:100,lost:0,rtt:.05}),'good');
 assert.equal(connectionQuality({received:90,lost:10,rtt:.1}),'poor');
 assert.equal(connectionQuality({received:100,lost:0,rtt:.4}),'fair');
 assert.equal(connectionQuality({received:100,lost:0,rtt:.9}),'poor');
 assert.equal(connectionQuality({received:200,lost:10,rtt:.05},{received:100,lost:10}),'good');
});

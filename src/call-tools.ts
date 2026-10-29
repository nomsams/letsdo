import { CHUNK_SIZE, type Packet } from './protocol.ts';

export const MAX_SNAPSHOT = 512 * 1024;

/** Only one bounded snapshot is assembled at a time. A new call must create a new receiver. */
export class SnapshotReceiver {
  private pending?: { id: string; size: number; chunks: ArrayBuffer[]; received: number };
  start(id: string, size: number) {
    if (!id || id.length > 64 || !Number.isInteger(size) || size < 1 || size > MAX_SNAPSHOT) return false;
    this.pending = { id, size, chunks: [], received: 0 }; return true;
  }
  append(id: string, data: ArrayBuffer) {
    const p = this.pending;
    if (!p || p.id !== id) return;
    if (!data.byteLength || data.byteLength > CHUNK_SIZE || p.received + data.byteLength > p.size) { this.clear(); return; }
    p.chunks.push(data); p.received += data.byteLength;
  }
  finish(id: string) {
    const p = this.pending;
    if (!p || p.id !== id) return null;
    if (p.received !== p.size) { this.clear(); return null; }
    this.clear(); return new Blob(p.chunks, { type: 'image/jpeg' });
  }
  clear() { this.pending = undefined; }
}

export function snapshotPackets(id: string, bytes: ArrayBuffer): Packet[] {
  if (!bytes.byteLength || bytes.byteLength > MAX_SNAPSHOT) throw new Error('Snapshot too large');
  const packets: Packet[] = [{ type: 'snapshot-start', id, size: bytes.byteLength }];
  for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_SIZE) packets.push({ type: 'snapshot-chunk', id, data: bytes.slice(offset, offset + CHUNK_SIZE) });
  packets.push({ type: 'snapshot-end', id }); return packets;
}

export function connectionQuality(current: { received: number; lost: number; rtt: number }, previous?: { received: number; lost: number }) {
  const received = Math.max(0, current.received - (previous?.received ?? 0));
  const lost = Math.max(0, current.lost - (previous?.lost ?? 0));
  const loss = received + lost ? lost / (received + lost) : 0;
  return loss > .08 || current.rtt > .7 ? 'poor' : loss > .025 || current.rtt > .3 ? 'fair' : 'good';
}

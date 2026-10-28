export type Role = 'guide' | 'camera';
export type Mode = 'guided' | 'video' | 'voice';
export type Point = { x: number; y: number };
export const MAX_FILE = 10 * 1024 * 1024;
export const CHUNK_SIZE = 16 * 1024;
export const opposite = (role: Role): Role => role === 'guide' ? 'camera' : 'guide';
export const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
export function normalizedPoint(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }): Point {
  return { x: clamp((clientX - box.left) / box.width), y: clamp((clientY - box.top) / box.height) };
}
export function fitRect(width: number, height: number, videoWidth: number, videoHeight: number) {
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const w = videoWidth * scale, h = videoHeight * scale;
  return { left: (width - w) / 2, top: (height - h) / 2, width: w, height: h };
}
export function inviteFromHash(hash: string): { peer: string; token: string } | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const peer = p.get('call'), token = p.get('key');
  return peer && /^[a-zA-Z0-9_-]{1,100}$/.test(peer) && token && /^[a-f0-9]{64}$/.test(token) ? { peer, token } : null;
}
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
export function createInvitationUrl(peer: string, token: string, currentUrl: string, publishedUrl?: string) {
  let url = new URL(currentUrl);
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && publishedUrl) {
    const published = new URL(publishedUrl);
    if (published.protocol === 'https:') url = published;
  }
  url.hash = new URLSearchParams({ call: peer, key: token }).toString();
  return url.href;
}
export function safeFilename(value: string) { return value.replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').slice(0, 150) || 'attachment'; }
export type Packet = { type: string; [key: string]: unknown };
export function validPacket(value: unknown): value is Packet {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const p = value as Packet;
  const point = () => typeof p.x === 'number' && Number.isFinite(p.x) && p.x >= 0 && p.x <= 1 && typeof p.y === 'number' && Number.isFinite(p.y) && p.y >= 0 && p.y <= 1;
  switch (p.type) {
    case 'hello': return typeof p.token === 'string' && /^[a-f0-9]{64}$/.test(p.token) && typeof p.name === 'string' && p.name.length <= 60;
    case 'welcome': return typeof p.name === 'string' && p.name.length <= 60 && ['guide','camera'].includes(String(p.role)) && ['guided','video','voice'].includes(String(p.mode));
    case 'chat': return typeof p.text === 'string' && p.text.length > 0 && p.text.length <= 4000;
    case 'arrow': return point() && typeof p.dx === 'number' && Math.abs(p.dx) <= 1 && typeof p.dy === 'number' && Math.abs(p.dy) <= 1;
    case 'target': case 'pointer': return point();
    case 'file-offer': return typeof p.id === 'string' && p.id.length <= 64 && typeof p.name === 'string' && p.name.length <= 150 && typeof p.size === 'number' && Number.isInteger(p.size) && p.size > 0 && p.size <= MAX_FILE;
    case 'file-accept': case 'file-reject': case 'file-end': return typeof p.id === 'string' && p.id.length <= 64;
    case 'file-chunk': return typeof p.id === 'string' && p.id.length <= 64 && p.data instanceof ArrayBuffer && p.data.byteLength <= CHUNK_SIZE;
    case 'screen': case 'pointer-permission': case 'camera-state': return typeof p.enabled === 'boolean';
    case 'accepted': case 'ready': case 'reject': case 'end': case 'hold': case 'closer': case 'further': case 'clear': case 'pointer-request': case 'ping': case 'pong': return true;
    default: return false;
  }
}
export class FileAssembly {
  chunks: ArrayBuffer[] = [];
  received = 0;
  readonly size: number;
  constructor(size: number) {
    if (!Number.isInteger(size) || size < 1 || size > MAX_FILE) throw new Error('Invalid file size');
    this.size = size;
  }
  append(chunk: ArrayBuffer) {
    if (chunk.byteLength === 0 || chunk.byteLength > CHUNK_SIZE || this.received + chunk.byteLength > this.size) throw new Error('Invalid file chunk');
    this.chunks.push(chunk); this.received += chunk.byteLength;
  }
  finish() {
    if (this.received !== this.size) throw new Error('Incomplete file');
    return new Blob(this.chunks, { type: 'application/octet-stream' });
  }
}

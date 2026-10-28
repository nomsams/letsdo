import { clamp, type Point } from './protocol';
/** Small, bounded, local template tracker. No uploaded frames or downloaded model. */
export class PatchTracker {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private template: Uint8ClampedArray | null = null;
  private point: Point = { x: .5, y: .5 };
  private misses = 0;
  constructor() { this.canvas.width = 256; this.canvas.height = 144; }
  private frame(video: HTMLVideoElement) {
    if (!video.videoWidth || video.readyState < 2) return false;
    this.canvas.height = Math.round(256 * video.videoHeight / video.videoWidth);
    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    return true;
  }
  lock(video: HTMLVideoElement, p: Point) {
    if (!this.frame(video)) return false;
    const w = this.canvas.width, h = this.canvas.height;
    this.point = { x: clamp(p.x, 8/w, 1-8/w), y: clamp(p.y, 8/h, 1-8/h) };
    this.template = this.ctx.getImageData(Math.round(this.point.x*w)-6, Math.round(this.point.y*h)-6, 12, 12).data;
    this.misses = 0; return true;
  }
  update(video: HTMLVideoElement): Point | null {
    if (!this.template || !this.frame(video)) return null;
    const w = this.canvas.width, h = this.canvas.height, frame = this.ctx.getImageData(0, 0, w, h).data;
    const cx = Math.round(this.point.x*w), cy = Math.round(this.point.y*h);
    let best = Infinity, bx = cx, by = cy;
    for (let y = Math.max(6,cy-14); y <= Math.min(h-7,cy+14); y += 2) {
      for (let x = Math.max(6,cx-14); x <= Math.min(w-7,cx+14); x += 2) {
        let error = 0;
        for (let j=0;j<12;j+=2) for(let i=0;i<12;i+=2) {
          const a=((y+j-6)*w+x+i-6)*4, b=(j*12+i)*4;
          error += Math.abs(frame[a]-this.template[b])+Math.abs(frame[a+1]-this.template[b+1])+Math.abs(frame[a+2]-this.template[b+2]);
        }
        if(error<best) {best=error;bx=x;by=y;}
      }
    }
    if (best/108 > 38) { if(++this.misses >= 4) this.stop(); return null; }
    this.misses = 0; this.point = {x:bx/w,y:by/h}; return this.point;
  }
  get active() { return !!this.template; }
  stop() { this.template = null; }
}

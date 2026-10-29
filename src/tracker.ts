import { clamp, type Point } from './protocol.ts';

/** Bounded local appearance tracking. Frames never leave the call for analysis. */
export class PatchTracker {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  private template: Float32Array | null = null;
  private point: Point = { x: .5, y: .5 };
  private width = .12;
  private height = .12;
  private misses = 0;
  private pixels?: Uint8ClampedArray;
  private frame(video: HTMLVideoElement) {
    if (!this.ctx || !video.videoWidth || !video.videoHeight || video.readyState < 2) return false;
    const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(32, Math.round(video.videoWidth * scale)), h = Math.max(32, Math.round(video.videoHeight * scale));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    try {
      this.ctx.drawImage(video, 0, 0, w, h);
      this.pixels = this.ctx.getImageData(0, 0, w, h).data;
      return true;
    } catch { this.stop(); return false; }
  }
  private patch(x: number, y: number, width: number, height: number, output: Float32Array) {
    const w = this.canvas.width, h = this.canvas.height, pixels = this.pixels!;
    if (x-width/2 < 0 || y-height/2 < 0 || x+width/2 >= w || y+height/2 >= h) return 0;
    let mean = 0;
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
      const index = (Math.floor(y + (j/11-.5)*height)*w + Math.floor(x + (i/11-.5)*width))*4;
      const value = pixels[index]*.299 + pixels[index+1]*.587 + pixels[index+2]*.114;
      output[j*12+i] = value; mean += value;
    }
    mean /= output.length;
    let norm = 0;
    for (let i=0;i<output.length;i++) { output[i]-=mean; norm+=output[i]**2; }
    norm = Math.sqrt(norm);
    if (norm < 70) return 0;
    for (let i=0;i<output.length;i++) output[i]/=norm;
    return norm;
  }
  lock(video: HTMLVideoElement, p: Point, size?: { width: number; height: number }) {
    this.stop();
    if (!this.frame(video)) return false;
    const w=this.canvas.width,h=this.canvas.height;
    this.width=clamp(size?.width ?? 36/w, 16/w, .55); this.height=clamp(size?.height ?? 36/h, 16/h, .55);
    this.point={x:clamp(p.x,this.width/2+.01,1-this.width/2-.01),y:clamp(p.y,this.height/2+.01,1-this.height/2-.01)};
    const patch=new Float32Array(144);
    if (!this.patch(this.point.x*w,this.point.y*h,this.width*w,this.height*h,patch)) return false;
    this.template=patch;this.misses=0;return true;
  }
  update(video: HTMLVideoElement): Point | null {
    if (!this.template) return null;
    if (!this.frame(video)) { if(++this.misses>=4)this.stop(); return null; }
    const w=this.canvas.width,h=this.canvas.height,cx=this.point.x*w,cy=this.point.y*h,candidate=new Float32Array(144);
    let best=-1,bx=cx,by=cy,scale=1;
    const radius=this.misses?32:20;
    for(const s of [1,.9,1.1]) for(let y=Math.round(cy)-radius;y<=cy+radius;y+=2) for(let x=Math.round(cx)-radius;x<=cx+radius;x+=2){
      if(!this.patch(x,y,this.width*w*s,this.height*h*s,candidate))continue;
      let score=0;for(let i=0;i<144;i++)score+=candidate[i]*this.template[i];
      if(score>best){best=score;bx=x;by=y;scale=s;}
    }
    if(best<.68){if(++this.misses>=4)this.stop();return null;}
    this.misses=0;this.point={x:bx/w,y:by/h};this.width*=scale;this.height*=scale;
    return this.point;
  }
  get region(){return {width:this.width,height:this.height};}
  get active(){return !!this.template;}
  stop(){this.template=null;this.pixels=undefined;}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { PatchTracker } from '../src/tracker.ts';

test('selected item follows translation and illumination changes, then releases on occlusion',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');let pixels=new Uint8ClampedArray();
 const ctx={drawImage(video:any){pixels=video.frame;},getImageData(){return{data:pixels};}};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:160,height:120,getContext:()=>ctx})}});
 function frame(cx:number,cy:number,brightness=0,blank=false){const pixels=new Uint8ClampedArray(160*120*4);for(let y=0;y<120;y++)for(let x=0;x<160;x++){const i=(y*160+x)*4,dx=x-cx+18,dy=y-cy+18;const value=!blank&&dx>=0&&dy>=0&&dx<36&&dy<36?30+((dx*31+dy*47+dx*dy*3)%170):45;pixels[i]=pixels[i+1]=pixels[i+2]=value+brightness;pixels[i+3]=255;}return pixels;}
 try{const tracker=new PatchTracker(),video={videoWidth:160,videoHeight:120,readyState:2,frame:frame(70,60)} as unknown as HTMLVideoElement&{frame:Uint8ClampedArray};assert.equal(tracker.lock(video,{x:70/160,y:.5}),true);video.frame=frame(78,66,12);const next=tracker.update(video);assert.ok(next);assert.ok(Math.abs(next.x-78/160)<.02);assert.ok(Math.abs(next.y-66/120)<.02);video.frame=frame(78,66,0,true);for(let i=0;i<4;i++)assert.equal(tracker.update(video),null);assert.equal(tracker.active,false);assert.equal(tracker.lock(video,{x:.5,y:.5}),false);
 }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});

test('unsupported canvas capture leaves object selection inactive without crashing the call',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({getContext:()=>null})}});try{assert.equal(new PatchTracker().lock({videoWidth:100,videoHeight:100,readyState:2} as HTMLVideoElement,{x:.5,y:.5}),false);}finally{if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { invitationQrSvg } from '../src/qr.ts';

// Rasterize the generated SVG's horizontal module strokes, then use an independent decoder.
function decodeSvg(svg:string){
 const modules=Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
 assert.ok(modules>20);const scale=6,size=modules*scale,pixels=new Uint8ClampedArray(size*size*4).fill(255);
 const stroke=/<path stroke="#([a-f0-9]{6})" d="([^"]+)"/.exec(svg);assert.ok(stroke);const path=stroke[2],rgb=[0,2,4].map(i=>parseInt(stroke[1].slice(i,i+2),16));
 let x=0,y=0;
 for(const command of path.matchAll(/([Mmh])([^Mmh]*)/g)){
  const values=command[2].trim().split(/\s+/).map(Number);
  if(command[1]==='M'){[x,y]=values;}else if(command[1]==='m'){x+=values[0];y+=values[1];}else{
   const length=values[0],left=Math.round(x*scale),top=Math.floor(y)*scale;
   for(let yy=top;yy<top+scale;yy++)for(let xx=left;xx<left+length*scale;xx++){const i=(yy*size+xx)*4;pixels[i]=rgb[0];pixels[i+1]=rgb[1];pixels[i+2]=rgb[2];}
   x+=length;
  }
 }
 return jsQR(pixels,size,size)?.data;
}
test('the generated QR independently decodes to the complete invitation including the private key',async()=>{
 for(const peer of ['test-123','a'.repeat(100)]){
  const invite=`https://nomsams.github.io/letsdo/#call=${peer}&key=${'b'.repeat(64)}`;
  const svg=await invitationQrSvg(invite);assert.equal(decodeSvg(svg),invite);assert.equal(svg.includes('<script'),false);assert.equal(svg.includes('<image'),false);
 }
});
test('QR generation rejects incomplete and non-web invitations',async()=>{
 await assert.rejects(invitationQrSvg('https://example.com/#call=test&key=partial'));
 await assert.rejects(invitationQrSvg('javascript:alert(1)#call=test&key='+'a'.repeat(64)));
});

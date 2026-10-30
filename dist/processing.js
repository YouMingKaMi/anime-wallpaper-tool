/* Pure pixel operations shared by preview, export, and the worker. No blur in color grading. */
(function(root){
const clamp=x=>Math.max(0,Math.min(255,x));
function processPixels(image,p){
 const d=image.data,w=image.width,h=image.height,s=p.saturation/100,c=p.contrast/100,f=p.fade/100,lift=p.shadows/100,bright=p.brightness*1.1;
 for(let i=0;i<d.length;i+=4){
  const lum=d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722;
  const light=lift*95*Math.pow(1-lum/255,2);
  for(let k=0;k<3;k++){
   let v=lum+(d[i+k]-lum)*s;
   v=(v-127.5)*c+127.5+light+bright;
   d[i+k]=clamp(v*(1-f)+[241,245,247][k]*f);
  }
 }
 if(p.sharpness>0){
  const src=new Uint8ClampedArray(d),amount=p.sharpness/100*.65;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
   const i=(y*w+x)*4;
   for(let k=0;k<3;k++){
    const detail=src[i+k]-(src[i-4+k]+src[i+4+k]+src[i-w*4+k]+src[i+w*4+k])/4;
    d[i+k]=clamp(src[i+k]+Math.max(-32,Math.min(32,detail))*amount);
   }
  }
 }
 return image;
}
function outputSize(w,h,resolution,ratio){
 let cw=w,ch=h;
 if(ratio==='wide'){if(w/h>16/9)cw=h*16/9;else ch=w*9/16;}
 const edge=resolution==='original'?Math.max(cw,ch):Number(resolution),scale=edge/Math.max(cw,ch);
 return {width:Math.max(1,Math.round(cw*scale)),height:Math.max(1,Math.round(ch*scale)),crop:{x:(w-cw)/2,y:(h-ch)/2,width:cw,height:ch}};
}
root.SoftwallProcessing={processPixels,outputSize};
if(typeof module!=='undefined')module.exports=root.SoftwallProcessing;
})(typeof self!=='undefined'?self:globalThis);

'use strict';
window.SoftwallLocal={
 ready:false,session:null,job:null,
 isLocal:['127.0.0.1','localhost'].includes(location.hostname),
 async init(){
  if(!this.isLocal)return false;
  try{const r=await fetch('/api/status',{cache:'no-store'}),s=await r.json();if(s.app==='softwall-local'&&s.ready){this.session=s;this.ready=true;return true;}}catch{}
  return false;
 },
 async request(path,options={}){
  const r=await fetch(path,{...options,headers:{'X-Softwall-Token':this.session.token,...options.headers}});
  if(!r.ok){const error=await r.json().catch(()=>({}));throw new Error(error.error||'本地处理程序未响应，请重新启动本地版。');}return r;
 },
 async cancel(){if(this.job&&this.session)await this.request('/api/jobs/'+this.job,{method:'DELETE'}).catch(()=>{});},
 async enhance(image,{signal,onProgress}){
  if(!await this.init())throw new Error('本地程序尚未就绪，请双击「start.command / start.bat」后再试。');
  const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
  if(w*h>this.session.max_pixels)throw new Error('动漫精细增强支持 800 万像素以内的原图，请先缩小图片。');
  const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(image,0,0);
  const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));c.width=0;
  if(!blob)throw new Error('未能读取原图，请重新选择图片。');
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  this.job=crypto.randomUUID();const path='/api/jobs/'+this.job;
  try{
   await this.request(path,{method:'POST',headers:{'Content-Type':'image/png'},body:blob});
   for(;;){
    if(signal.aborted){await this.cancel();throw new DOMException('Aborted','AbortError');}
    const state=await(await this.request(path)).json();
    onProgress(state.progress,`${state.message} · ${Math.floor(state.elapsed/60)}分${state.elapsed%60}秒`);
    if(state.status==='done')break;
    if(state.status==='cancelled')throw new DOMException('Aborted','AbortError');
    if(state.status==='failed')throw new Error(state.message);
    await new Promise(resolve=>setTimeout(resolve,750));
   }
   if(signal.aborted)throw new DOMException('Aborted','AbortError');
   const result=await(await this.request(path+'/result')).blob(),url=URL.createObjectURL(result),output=new Image();
   try{output.src=url;await output.decode();return output;}finally{URL.revokeObjectURL(url);}
  }finally{this.job=null;}
 }
};

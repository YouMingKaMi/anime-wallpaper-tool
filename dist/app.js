'use strict';
const $=id=>document.getElementById(id),$$=s=>[...document.querySelectorAll(s)];
const controls=[
 ['saturation','颜色饱和度',0,150,'颜色由淡到浓'],
 ['contrast','明暗反差',30,130,'向左更柔和，向右更鲜明'],
 ['shadows','暗部提亮',0,100,'让深色轻一些，保留亮部层次'],
 ['fade','浅淡程度',0,65,'轻轻融入一层浅色'],
 ['brightness','整体亮度',-30,30,'微调画面的明亮程度'],
 ['sharpness','细节锐化',0,100,'轻微增强边缘，不改变分辨率']
];
const presets={original:{saturation:100,contrast:100,shadows:0,fade:0,brightness:0,sharpness:0},soft:{saturation:68,contrast:78,shadows:32,fade:9,brightness:3,sharpness:25},mist:{saturation:48,contrast:61,shadows:50,fade:20,brightness:4,sharpness:18},night:{saturation:62,contrast:82,shadows:8,fade:0,brightness:-22,sharpness:20}};
const names={original:'原色',soft:'轻柔日常',mist:'浅雾',night:'静夜'};
let centerZoom=false;
let params={...presets.soft},originalImage=null,enhancedImage=null,enhancedEngine='',filename='sky',view='result',zoomed=false,previewOriginal=null,previewVersion=0,loadVersion=0,busy=false,aiAbort=null,engine=null,engineScale=0,worker=null,jobId=0,pending=new Map(),toastTimer,renderTimer;
const neutral=presets.original;
try{worker=new Worker('worker.js');worker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;pending.delete(data.id);data.error?job.reject(new Error(data.error)):job.resolve(data.image);};worker.onerror=()=>{for(const job of pending.values())job.reject(new Error('图片处理未完成，请重新尝试。'));pending.clear();worker.terminate();worker=null;};}catch{}
function processImage(image,p){if(!worker)return Promise.resolve(SoftwallProcessing.processPixels(image,p));return new Promise((resolve,reject)=>{const id=++jobId;pending.set(id,{resolve,reject});worker.postMessage({id,image,params:p},[image.data.buffer]);});}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),6500);}
function canvas(w,h){const el=document.createElement('canvas');el.width=w;el.height=h;return el;}
function context(el){return el.getContext('2d',{willReadFrequently:true});}
function dimensions(image){return{width:image.naturalWidth||image.width,height:image.naturalHeight||image.height};}
function size(){if(!originalImage)return null;const {width,height}=dimensions(originalImage);return SoftwallProcessing.outputSize(width,height,$('resolution').value,$('ratio').value);}
function cropInto(image,w,h){const c=canvas(w,h),ctx=context(c),d=dimensions(image),r=SoftwallProcessing.outputSize(d.width,d.height,'original',$('ratio').value).crop;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,r.x,r.y,r.width,r.height,0,0,w,h);return c;}
function updateMeta(){if(!originalImage)return;const s=size(),d=dimensions(originalImage);$('sourceMeta').textContent=`${d.width} × ${d.height} px · 原始图片`;$('exportSize').textContent=`${s.width} × ${s.height} px`;$('sizeTag').textContent=$('resolution').value==='3840'?'4K':$('resolution').value==='2560'?'2560':'原尺寸';$('exportMethod').textContent=enhancedImage?enhancedEngine+' + 调色':'高质量缩放';$('aiResult').hidden=!enhancedImage;if(enhancedImage)$('aiResultLabel').textContent='✓ 已使用 '+enhancedEngine;}
function fitStage(){if(!previewOriginal)return;const vp=$('viewport');let w=previewOriginal.width,h=previewOriginal.height;if(!zoomed){const f=Math.min((vp.clientWidth-52)/w,(vp.clientHeight-48)/h,1);w*=f;h*=f;}$('stage').style.width=w+'px';$('stage').style.height=h+'px';}
async function render(){
 if(!originalImage)return;const version=++previewVersion;
 const source=enhancedImage||originalImage,d=dimensions(source),r=SoftwallProcessing.outputSize(d.width,d.height,'original',$('ratio').value),factor=zoomed?1:Math.min(1,1600/Math.max(r.width,r.height));
 const w=Math.round(r.width*factor),h=Math.round(r.height*factor),base=cropInto(source,w,h),before=cropInto(originalImage,w,h);
 const image=await processImage(context(base).getImageData(0,0,w,h),{...params});
 if(version!==previewVersion)return;
 for(const id of ['edited','original']){$(id).width=w;$(id).height=h;}
 context($('edited')).putImageData(image,0,0);context($('original')).drawImage(before,0,0);previewOriginal=before;
 $('previewMeta').textContent=zoomed?`100% 实际像素 · 滚动查看${enhancedImage?' · AI 增强':''}`:`适应窗口 · ${enhancedImage?'AI 增强':'实时调色'}预览`;
 fitStage();if(centerZoom&&zoomed){const vp=$('viewport');vp.scrollLeft=Math.max(0,(w-vp.clientWidth)/2);vp.scrollTop=Math.max(0,(h-vp.clientHeight)/2);centerZoom=false;}updateMeta();
}
function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>render().catch(e=>toast(e.message)),40);}
function setView(mode){view=mode;$('stage').dataset.view=mode;$$('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===mode);b.setAttribute('aria-pressed',b.dataset.view===mode);});$('compareControl').hidden=mode!=='compare';setSplit();}
function setSplit(){const n=$('split').value;$('original').style.clipPath=`inset(0 ${100-n}% 0 0)`;$('splitLine').style.left=n+'%';}
function syncControls(){for(const [key]of controls){$(key).value=params[key];$('value-'+key).value=params[key]+(key==='brightness'?'':'%');$(key).style.background=`linear-gradient(to right,#8fa68b ${(params[key]-Number($(key).min))/(Number($(key).max)-Number($(key).min))*100}%,#e3e8df 0)`;}}
function preset(name){params={...presets[name]};$$('[data-preset]').forEach(b=>{b.classList.toggle('selected',b.dataset.preset===name);b.setAttribute('aria-pressed',b.dataset.preset===name);});$('activePreset').textContent=names[name];syncControls();scheduleRender();}
for(const [key,label,min,max,hint]of controls){const row=document.createElement('div');row.className='slider-row';row.innerHTML=`<div class="slider-label"><label for="${key}">${label}</label><output id="value-${key}" for="${key}"></output></div><input id="${key}" type="range" min="${min}" max="${max}" step="1" aria-describedby="hint-${key}"><small id="hint-${key}">${hint}</small>`;$('sliders').append(row);$(key).addEventListener('input',()=>{params[key]=Number($(key).value);$$('[data-preset]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});$('activePreset').textContent='自定义';syncControls();scheduleRender();});}
async function decode(src){const img=new Image();img.src=src;await img.decode();return img;}
async function loadImage(src,name,sample=null){if(busy)return;const version=++loadVersion;try{const image=await decode(src),{width,height}=dimensions(image);if(version!==loadVersion)return;if(width*height>32000000||width>16384||height>16384)throw new Error('这张图片过大，请选择不超过 3200 万像素、单边 16384 的图片。');originalImage=image;enhancedImage=null;enhancedEngine='';filename=name.replace(/\.[^.]+$/,'');$('fileName').textContent=name;$$('[data-sample]').forEach(b=>b.classList.toggle('selected',b.dataset.sample===sample));zoomed=false;$('zoom').setAttribute('aria-pressed','false');$('viewport').classList.remove('zoomed');await render();updateEngineUI();}catch(e){toast('无法打开图片：'+e.message);}finally{if(src.startsWith('blob:'))URL.revokeObjectURL(src);}}
function loadFile(file){if(!file||busy)return;if(!/^image\/(png|jpeg|webp)$/.test(file.type)){toast('请选择 PNG、JPG 或 WebP 图片。');return;}if(file.size>40*1024*1024){toast('请选择 40 MB 以内的图片。');return;}loadImage(URL.createObjectURL(file),file.name);}
$('file').addEventListener('change',e=>{loadFile(e.target.files[0]);e.target.value='';});
document.addEventListener('paste',e=>{const item=[...e.clipboardData.items].find(i=>i.type.startsWith('image/'));if(item){e.preventDefault();loadFile(item.getAsFile());}});
let dragDepth=0;document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('viewport').classList.remove('drag');loadFile(e.dataTransfer.files[0]);});$('viewport').addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;$('viewport').classList.add('drag');});$('viewport').addEventListener('dragleave',()=>{if(--dragDepth<=0)$('viewport').classList.remove('drag');});
$$('[data-sample]').forEach(b=>b.onclick=()=>loadImage(b.dataset.sample==='sky'?'assets/sky.png':'assets/portrait.jpg',b.dataset.sample==='sky'?'天空 · 示例壁纸':'人物 · 示例壁纸',b.dataset.sample));
$$('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('reset').onclick=()=>preset('original');$('split').oninput=setSplit;
$('zoom').onclick=()=>{zoomed=!zoomed;centerZoom=zoomed;$('zoom').setAttribute('aria-pressed',String(zoomed));$('viewport').classList.toggle('zoomed',zoomed);scheduleRender();};
$('wallPreview').onclick=()=>{$('browserPreview').hidden=!$('browserPreview').hidden;$('wallPreview').setAttribute('aria-pressed',String(!$('browserPreview').hidden));};
$('ratio').onchange=()=>{updateMeta();scheduleRender();};$('resolution').onchange=updateMeta;window.addEventListener('resize',fitStage);
function setBusy(value){busy=value;document.body.classList.toggle('busy',value);$('adjustments').disabled=value;for(const id of ['file','resolution','ratio','format','download','enhance','removeAI','zoom','engineSelect'])$(id).disabled=value;$$('[data-sample]').forEach(b=>b.disabled=value);}
function progress(n,text){$('progressFill').style.width=n+'%';$('progressText').textContent=text;}
function loadScript(src){return new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>{tag.remove();reject(new Error('AI 组件加载失败，请检查网络后重试。'));};document.head.append(tag);});}
let aiLibraries;
async function getEngine(scale){
 if(!aiLibraries)aiLibraries=(async()=>{await loadScript('vendor/tf.min.js');await loadScript('vendor/esrgan-2x.js');await loadScript('vendor/esrgan-4x.js');await loadScript('vendor/upscaler.min.js');})().catch(e=>{aiLibraries=null;throw e;});await aiLibraries;
 if(!(await tf.setBackend('webgl')))throw new Error('当前浏览器不支持图形加速，请尝试 Chrome 或 Edge，或使用普通 4K 导出。');await tf.ready();
 if(engine&&engineScale===scale)return engine;if(engine)await engine.dispose();
 const def=scale===4?ESRGANSlim4x:ESRGANSlim2x;
 engine=new Upscaler({model:{...def,_internals:undefined,path:new URL(`models/x${scale}/model.json`,location.href).href}});engineScale=scale;
 await engine.getModel();return engine;
}
const tick=()=>new Promise(r=>requestAnimationFrame(r));
function updateEngineUI(){
 const local=$('engineSelect').value==='local';
 $('localConnection').textContent=local?(SoftwallLocal.ready?'● 本地模型已就绪':'○ 需要启动本地版'):'● 在浏览器内运行';
 $('localConnection').classList.toggle('ready',!local||SoftwallLocal.ready);
 $('enhanceInfo').textContent=local?'Real-ESRGAN 动漫插画模型 · 4 倍增强后生成 4K。':'使用原来的轻量模型，适合快速处理。';
 $('localHint').hidden=!local||SoftwallLocal.ready;
 $('enhance').textContent=local?(SoftwallLocal.ready?'✧ 动漫精细增强':'打开本机增强版 ↗'):'✧ 浏览器轻量增强';
}
$('engineSelect').onchange=updateEngineUI;
$('enhance').onclick=async()=>{
 if(!originalImage||busy)return;
 const local=$('engineSelect').value==='local';
 if(local&&!SoftwallLocal.ready){if(!await SoftwallLocal.init()){if(!SoftwallLocal.isLocal)window.open('http://127.0.0.1:8839/','_blank','noopener');else toast('请双击「start.command / start.bat」重新启动本地版。');return;}updateEngineUI();}
 setBusy(true);$('aiProgress').hidden=false;$('aiResult').hidden=true;aiAbort=new AbortController();progress(0,local?'正在启动动漫精细模型…':'正在加载浏览器 AI 模型…');
 const signal=aiAbort.signal;
 try{
  if(local){
   enhancedImage=await SoftwallLocal.enhance(originalImage,{signal,onProgress:progress});
   enhancedEngine='Real-ESRGAN 动漫';await render();toast('动漫精细增强完成。可选择「原色」并用 100% 视图检查细节。');return;
  }
  const d=dimensions(originalImage),long=Math.max(d.width,d.height),scale=long<1920?4:2;
  if(long>=3840){toast('原图已达到 4K，可先用细节锐化调整清晰感，再直接导出。');return;}
  const up=await getEngine(scale);if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const ratio=3840/long,out=canvas(Math.round(d.width*ratio),Math.round(d.height*ratio)),ctx=context(out),tile=128,pad=12,total=Math.ceil(d.width/tile)*Math.ceil(d.height/tile);let done=0;
  const start=performance.now();
  for(let y=0;y<d.height;y+=tile)for(let x=0;x<d.width;x+=tile){
   if(signal.aborted)throw new DOMException('Aborted','AbortError');
   const tw=Math.min(tile,d.width-x),th=Math.min(tile,d.height-y),sx=Math.max(0,x-pad),sy=Math.max(0,y-pad),ex=Math.min(d.width,x+tw+pad),ey=Math.min(d.height,y+th+pad),part=canvas(ex-sx,ey-sy);
   context(part).drawImage(originalImage,sx,sy,ex-sx,ey-sy,0,0,part.width,part.height);
   let tensor;
   try{
    tensor=await up.upscale(part,{output:'tensor',patchSize:64,padding:6,awaitNextFrame:true,signal});
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    const piece=canvas(part.width*scale,part.height*scale),pixels=tf.tidy(()=>tensor.clipByValue(0,255).round().cast('int32'));
    try{await tf.browser.toPixels(pixels,piece);}finally{pixels.dispose();}
    const dx=Math.round(x*ratio),dy=Math.round(y*ratio),dw=Math.round((x+tw)*ratio)-dx,dh=Math.round((y+th)*ratio)-dy;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(piece,(x-sx)*scale,(y-sy)*scale,tw*scale,th*scale,dx,dy,dw,dh);piece.width=0;
   }finally{tensor?.dispose();part.width=0;}
   done++;const pct=Math.round(done/total*100),elapsed=(performance.now()-start)/1000,remaining=done>2?Math.ceil((total-done)*elapsed/done):null;
   progress(pct,`清晰化 ${pct}%${remaining!==null?' · 约剩 '+(remaining>60?Math.ceil(remaining/60)+' 分钟':remaining+' 秒'):''}`);await tick();
  }
  ctx.globalCompositeOperation='destination-in';ctx.drawImage(originalImage,0,0,out.width,out.height);ctx.globalCompositeOperation='source-over';
  enhancedImage=out;enhancedEngine='浏览器 AI';await render();toast('AI 清晰化完成。可以继续调色，或用 100% 视图检查细节。');
 }catch(e){if(signal.aborted||e.name==='AbortError')toast('已取消清晰化，原图和调色设置都已保留。');else{console.error(e);toast(/[\u4e00-\u9fff]/.test(e.message)?e.message:'AI 清晰化未完成，请重试或换用支持图形加速的浏览器。也可以使用普通 4K 导出。');}}
 finally{aiAbort=null;$('aiProgress').hidden=true;setBusy(false);updateMeta();updateEngineUI();}
};
$('cancelAI').onclick=()=>{aiAbort?.abort();if($('engineSelect').value==='local')SoftwallLocal.cancel();else engine?.abort();progress(0,'正在取消…');};
$('removeAI').onclick=()=>{enhancedImage=null;enhancedEngine='';updateEngineUI();scheduleRender();};
$('download').onclick=async()=>{
 if(!originalImage||busy)return;setBusy(true);$('download').textContent='正在生成壁纸…';
 try{await tick();const s=size(),c=cropInto(enhancedImage||originalImage,s.width,s.height),ctx=context(c),img=await processImage(ctx.getImageData(0,0,c.width,c.height),{...params});ctx.putImageData(img,0,0);const fmt=$('format').value,blob=await new Promise(r=>c.toBlob(r,'image/'+fmt,.96));if(!blob)throw new Error('图片导出失败，请降低输出尺寸后重试。');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${filename.replace(/[<>:"/\\|?*]/g,'-')}-浅景-${s.width}x${s.height}.${fmt==='jpeg'?'jpg':'png'}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast(`壁纸已生成：${s.width} × ${s.height}，请查看下载。`);c.width=0;}catch(e){toast(e.message);}finally{setBusy(false);$('download').innerHTML='下载壁纸 <span>↓</span>';}
};
for(const id of ['help','about'])$(id).onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();$('helpDialog').addEventListener('click',e=>{if(e.target===$('helpDialog')){const r=$('helpDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('helpDialog').close();}});
syncControls();setView('result');loadImage('assets/sky.png','天空 · 示例壁纸','sky').then(updateEngineUI);SoftwallLocal.init().then(ready=>{$('engineSelect').value=ready?'local':'browser';updateEngineUI();});

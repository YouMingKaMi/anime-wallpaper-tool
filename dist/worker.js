importScripts('processing.js');
self.onmessage=e=>{const {id,image,params}=e.data;try{const result=SoftwallProcessing.processPixels(image,params);self.postMessage({id,image:result},[result.data.buffer]);}catch(error){self.postMessage({id,error:error.message});}};

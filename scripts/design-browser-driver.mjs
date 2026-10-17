import {mkdir,writeFile} from 'node:fs/promises';
export async function browser(url){
 const target=await(await fetch((process.env.BROWSER_DEBUG_URL||'http://127.0.0.1:9223')+'/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 let next=1;const pending=new Map(),errors=[];
 ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);pending.delete(message.id);if(message.error)p.reject(Error(message.error.message));else p.resolve(message.result)}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text)};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=next++;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
 async function js(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
 async function wait(expression,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await js(expression))return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('Timed out: '+expression+'\n'+await js('document.body.innerText'))}
 async function goto(url){await send('Page.navigate',{url});await wait('document.readyState==="complete"');}
 async function shot(name){await mkdir('var/screenshots',{recursive:true});await js('document.fonts.ready');await wait('[...document.images].every(i=>i.complete)');const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('var/screenshots/'+name+'.png',Buffer.from(r.data,'base64'));return r.data}
 async function fill(selector,value){await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input '+${JSON.stringify(selector)});const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`)}
 async function click(text){await js(`(()=>{const e=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&!e.disabled);if(!e)throw Error('Missing enabled button '+${JSON.stringify(text)});e.click()})()`)}
 async function request(path,method='GET',body){return js(`(async()=>{const r=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json'},body:${body===undefined?'undefined':JSON.stringify(JSON.stringify(body))}});const value=await r.json();if(!r.ok)throw Error(r.status+': '+JSON.stringify(value));return value})()`)}
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 return {send,js,wait,goto,shot,fill,click,request,errors,close:()=>ws.close()}
}

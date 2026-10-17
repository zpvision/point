// Isolated test browser and disposable PostgreSQL schema only. Never uses a personal browser profile.
import {writeFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {browser} from './design-browser-driver.mjs';
const reference=process.env.REFERENCE_URL||'http://localhost:5174',target=process.env.APP_URL||'http://localhost:8081';
const a=await browser(reference+'/market'),b=await browser(target+'/market');
const report=[];
try{
 await a.wait('!!document.querySelector(".catalog-heading")');
 const consent=await a.request('/api/point-consent');await a.request('/api/point-consent','POST',{accepted:true,readToEnd:true,version:consent.version});
 await a.goto(reference+'/signin-with-chatgpt?return_to=/account');await a.wait('!!document.querySelector(".cabinet-shelf-photo")');
 const profile=await a.request('/api/cabinet/profile');
 await b.wait('!!document.querySelector(".catalog-heading")');
 let me=await b.request('/api/me');
 if(me.user&&me.user.email!==profile.email){await b.request('/api/auth/logout','POST',{});me={user:null};}
 if(!me.user){
  try{await b.request('/api/auth/login','POST',{email:profile.email,password:'design-test-only-password-7F!dK9'});me=await b.request('/api/me')}catch{}
 }
 if(!me.user){
  let {session}=await b.request('/api/registration/sessions','POST',{code:'USER_REGISTRATION'});
  const values={first_name:profile.name||'Seedy',last_name:'User',phone:'+79991234567',email:profile.email||'design@example.test',password:'design-test-only-password-7F!dK9',consent:true};
  while(session.next)session=await b.request(`/api/registration/sessions/${session.id}/answers`,'POST',{key:session.next.key,value:values[session.next.key],version_id:session.version_id});
  await b.request(`/api/registration/sessions/${session.id}/complete`,'POST',{});
 }
 const doc=await b.request('/api/point-consent');await b.request('/api/point-consent','POST',{accepted:true,readToEnd:true,version:doc.version});
 await b.request('/api/cabinet/profile','PUT',{name:profile.name,phone:profile.phone});
 // Match the reference's existing draft state in the isolated target schema only.
 const referenceItems=await a.request('/api/cabinet/points');
 for(const item of referenceItems){if(item.status==='draft'&&item.data.photos.length===0)await b.request('/api/cabinet/points','PUT',{...item,status:'draft'});}

 const metrics=async page=>page.js(`Object.fromEntries(['.header','.main','.page-heading','h1','.cabinet-shelf-photo','.single-point-section','.steps-panel','.chat-header','.preview-panel'].map(s=>{const e=document.querySelector(s);if(!e)return [s,null];const r=e.getBoundingClientRect(),c=getComputedStyle(e);return [s,{x:r.x,y:r.y,width:r.width,height:r.height,font:c.font,color:c.color,background:c.backgroundColor,padding:c.padding}]}))`);
 for(const [name,path,ready]of [['account','/account','!!document.querySelector(".single-point-section")'],['registration','/account/points/new','!!document.querySelector(".chat-header") && !document.querySelector(".assistant-typing")'],['market','/market','!!document.querySelector(".empty-mark")']]){
  for(const width of [1440,390]){
   for(const p of [a,b]){await p.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await p.goto((p===a?reference:target)+path);await p.wait(ready);await p.js('document.fonts.ready');}
   const first=await a.shot(`reference-${name}-${width}`),second=await b.shot(`design-${name}-${width}`);
   const x=PNG.sync.read(Buffer.from(first,'base64')),y=PNG.sync.read(Buffer.from(second,'base64'));let different=0;const diff=new PNG({width:x.width,height:x.height});
   for(let i=0;i<x.data.length;i+=4){const delta=Math.max(...[0,1,2].map(k=>Math.abs(x.data[i+k]-y.data[i+k])));if(delta>8)different++;diff.data[i]=delta>8?240:x.data[i]*.3;diff.data[i+1]=delta>8?40:x.data[i+1]*.3;diff.data[i+2]=delta>8?80:x.data[i+2]*.3;diff.data[i+3]=255}
   await writeFile(`var/screenshots/diff-${name}-${width}.png`,PNG.sync.write(diff));
   const overflow=await b.js('document.documentElement.scrollWidth>innerWidth');if(overflow)throw Error(name+' overflow at '+width);
   report.push({page:name,width,differentPixelsPercent:100*different/(x.width*x.height),reference:await metrics(a),design:await metrics(b)});
   console.log(name,width,'different pixels',report.at(-1).differentPixelsPercent.toFixed(3)+'%');
  }
 }
 await writeFile('var/screenshots/visual-report.json',JSON.stringify(report,null,2));
 if(b.errors.length)throw Error(b.errors.join('\n'));
 console.log('Screenshots, pixel differences, geometry and overflow checks saved.');
}finally{a.close();b.close()}

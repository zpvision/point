// Visual fixtures replace reads in the test browser; the reference DB is never written.
import {writeFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {browser} from './design-browser-driver.mjs';
const reference=process.env.REFERENCE_URL||'http://localhost:5174',target=process.env.APP_URL||'http://localhost:8081';
const a=await browser(reference+'/market'),b=await browser(target+'/market');
const fixture={id:'f0f0f0f0-0000-4000-8000-000000000001',status:'draft',updated:'2026-10-18T00:00:00Z',data:{legal:'ИП',inn:'500100732259',company:'ИП Тестовый',address:'Москва, Ленинградский проспект, 36',entrance:'С улицы',directions:'Вход с улицы, справа от аптеки',premises:'Магазин',operations:['Выдача заказов','Приём отправлений'],capacity:'до 100',weight:'до 20 кг',hours:['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'].map(day=>({day,open:true,from:'09:00',to:'19:00'})),photos:[],contact:'Я',contactName:'Seedy',contactPhone:'+79991234567',step:0,answered:[]}};
const report=[];
const scenario=await(await fetch(target+'/api/scenarios/POINT_REGISTRATION')).json();
try{
 for(const page of [a,b]){
  await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
   const original=window.fetch.bind(window);const fixture=${JSON.stringify(fixture)};const step=Number(new URLSearchParams(location.search).get('visual_step')||0);fixture.data.step=step;fixture.data.answered=Array.from({length:step},(_,i)=>i);
   window.fetch=async(input,options)=>{const u=new URL(typeof input==='string'?input:input.url,location.href);const get=!options?.method||options.method==='GET';
    const respond=v=>Promise.resolve(new Response(JSON.stringify(v),{status:200,headers:{'Content-Type':'application/json'}}));
    if(get&&u.pathname==='/api/cabinet/points')return respond([fixture]);
    if(get&&u.pathname==='/api/cabinet/profile')return respond({name:'Seedy',email:'seedy@sites.test',phone:'+79991234567'});
    if(get&&u.pathname==='/api/points')return respond([]);
    if(get&&u.pathname==='/api/registration/sessions/'+fixture.id)return respond({graph:${JSON.stringify(scenario.graph)}});
    if(get&&u.pathname==='/api/point-registration')return respond({application:null});
    return original(input,options);
   };
  })()`});
 }
 for(const width of [1440,390])for(let step=0;step<12;step++){
  if(step===10)continue; // Native photo categories are an intentional additional backend-required control.
  for(const page of [a,b]){
   await page.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
   await page.goto((page===a?reference:target)+'/account/points/'+fixture.id+'?visual_step='+step);
   await page.wait('!!document.querySelector(".chat-header") && !document.querySelector(".assistant-typing")');
   // Compare the same logical scroll position after asynchronous typing/layout settles.
   await page.js(`(()=>{const n=document.querySelector('.active-question'),s=document.querySelector('.chat-stream');s.scrollTop=n.getBoundingClientRect().top-s.getBoundingClientRect().top+s.scrollTop-18})()`);
  }
  const one=PNG.sync.read(Buffer.from(await a.shot(`reference-step-${step}-${width}`),'base64')),two=PNG.sync.read(Buffer.from(await b.shot(`design-step-${step}-${width}`),'base64'));
  let differences=0;for(let i=0;i<one.data.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(one.data[i+k]-two.data[i+k])))>8)differences++;
  const overflow=await b.js('document.documentElement.scrollWidth>innerWidth');if(overflow)throw Error('Overflow at step '+step+' width '+width);
  const row={step,width,differentPixelsPercent:100*differences/(one.width*one.height)};report.push(row);console.log(JSON.stringify(row));
 }
 await writeFile('var/screenshots/steps-visual-report.json',JSON.stringify(report,null,2));
 if(b.errors.length)throw Error(b.errors.join('\n'));
}finally{a.close();b.close()}

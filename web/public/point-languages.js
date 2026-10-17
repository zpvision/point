(()=>{
 if(window.pointLanguagesInstalled)return;window.pointLanguagesInstalled=true;
 const codes=['ru','en','zh'];let lang='ru';try{lang=localStorage.getItem('point-language')||'ru'}catch{}if(!codes.includes(lang))lang='ru';
 let dictionary={},pending=false;const originals=new WeakMap(),attributes=new WeakMap();
 const toolbar=document.createElement('div');toolbar.className='point-toolbar';toolbar.innerHTML='<div class="point-language" role="group" aria-label="Language / Язык / 语言"><button type="button" lang="ru" data-lang="ru">RU</button><button type="button" lang="en" data-lang="en">EN</button><button type="button" lang="zh" data-lang="zh">中文</button></div><button class="point-app" type="button"><span>Скачать приложение Point</span><small>Скоро</small></button>';
 document.body.prepend(toolbar);
 const dialog=document.createElement('dialog');dialog.className='point-app-dialog';dialog.setAttribute('aria-labelledby','point-app-title');dialog.innerHTML='<div class="pc-brand">point<span class="point-dot">.</span></div><h2 id="point-app-title">Приложение Point готовится к запуску.</h2><p>После запуска здесь появятся ссылки для скачивания. Сейчас вы можете пользоваться сайтом с телефона.</p><button type="button">Понятно</button>';document.body.append(dialog);
 toolbar.querySelector('.point-app').onclick=()=>dialog.showModal();dialog.querySelector('button').onclick=()=>dialog.close();
 function translate(s){const key=s.trim(),v=dictionary[key];if(lang==='ru'||!v)return s;return s.replace(key,v[lang==='en'?0:1]);}
 function excluded(el){return !el||el.closest('script,style,textarea,input,[translate="no"],[data-no-translate],.point-language');}
 function apply(){pending=false;document.documentElement.lang=lang==='zh'?'zh-CN':lang;toolbar.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===lang)));
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
  while(n=walker.nextNode()){if(excluded(n.parentElement))continue;let old=originals.get(n);if(!old||n.nodeValue!==old.last)old={source:n.nodeValue,last:n.nodeValue};const next=translate(old.source);if(n.nodeValue!==next)n.nodeValue=next;old.last=next;originals.set(n,old);}
  document.querySelectorAll('[placeholder],[aria-label],[title],[alt]').forEach(el=>{if(el.closest('[translate="no"],.point-language'))return;let saved=attributes.get(el)||{};for(const key of ['placeholder','aria-label','title','alt']){if(!el.hasAttribute(key))continue;const current=el.getAttribute(key);let old=saved[key];if(!old||old.last!==current)old={source:current,last:current};const next=translate(old.source);if(current!==next)el.setAttribute(key,next);old.last=next;saved[key]=old;}attributes.set(el,saved);});
 }
 function schedule(){if(!pending){pending=true;queueMicrotask(apply)}}
 toolbar.querySelectorAll('[data-lang]').forEach(b=>b.onclick=()=>{lang=b.dataset.lang;try{localStorage.setItem('point-language',lang)}catch{}apply();window.dispatchEvent(new CustomEvent('point-language',{detail:lang}));});
 const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.type==='characterData'&&originals.get(r.target)?.last!==r.target.nodeValue||r.type==='attributes'&&attributes.get(r.target)?.[r.attributeName]?.last!==r.target.getAttribute(r.attributeName)))schedule()});observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title','alt']});
 fetch('/locales/interface.json?v=16').then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{dictionary=d;apply()}).catch(()=>{lang='ru';apply()});apply();
})();

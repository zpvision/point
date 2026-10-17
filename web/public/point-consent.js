(()=>{
 if(window.pointConsentInstalled)return;window.pointConsentInstalled=true;
 const css=document.createElement('link');css.rel='stylesheet';css.href='/point-consent.css?v=16';document.head.append(css);
 const dialog=document.createElement('dialog');dialog.className='pc-dialog';dialog.setAttribute('aria-labelledby','pc-title');dialog.setAttribute('aria-describedby','pc-intro');
 dialog.innerHTML=`<div class="pc-top"><span class="pc-brand">point<span class="point-dot">.</span></span><button class="pc-close" type="button" aria-label="Закрыть согласие">×</button></div><p class="pc-kicker">ПЕРЕД РЕГИСТРАЦИЕЙ</p><h2 id="pc-title">Ваши данные.<br>Ваше решение.</h2><p id="pc-intro">Чтобы AI Point Ассистент сохранил заявку и мы могли связаться с вами, нужно ваше отдельное согласие на обработку персональных данных.</p><p class="point-legal-note">Юридические документы представлены на русском языке. Ознакомьтесь с полным оригиналом перед подтверждением.</p><div translate="no" class="pc-copy" tabindex="0" aria-label="Текст согласия"><p>Загружаем документ…</p></div><p class="pc-scroll-hint" role="status">Прокрутите согласие до конца, чтобы продолжить.</p><p class="pc-links"><a href="/legal/point-consent" target="_blank" rel="noopener">Открыть согласие ↗</a><a href="/legal/point-privacy" target="_blank" rel="noopener">Политика обработки данных ↗</a></p><form class="pc-form"><label class="pc-check"><input type="checkbox" name="accepted" required disabled><span>Я прочитал(а) отдельное согласие и добровольно соглашаюсь на обработку моих персональных данных для регистрации поинта.</span></label><p class="pc-error" role="status" aria-live="polite"></p><div class="pc-actions"><button class="pc-secondary pc-decline" type="button">Отказаться</button><button class="pc-primary" type="submit" disabled>Согласиться и продолжить</button></div><p class="pc-note">Без согласия можно продолжить просмотр сайта. Согласие не включает рекламу и не означает заключение договора.</p></form>`;
 document.body.append(dialog);
 const form=dialog.querySelector('form'),check=dialog.querySelector('input'),submit=dialog.querySelector('[type=submit]'),copy=dialog.querySelector('.pc-copy'),error=dialog.querySelector('.pc-error');
 let doc=null,target='/account/points/new',busy=false,reachedEnd=false,opener=null,requestNumber=0;
 const safeTarget=p=>/^\/account(?:\/points(?:\/(?:new|[a-f0-9-]{36}))?)?$/.test(p)?p:'/account/points/new';
 function close(){if(busy)return;dialog.close();}
 dialog.querySelector('.pc-close').onclick=close;dialog.querySelector('.pc-decline').onclick=close;
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
 dialog.addEventListener('close',()=>{document.body.classList.remove('pc-modal-open');opener?.focus();});
 function updateGate(){if(doc&&copy.scrollHeight-copy.clientHeight-copy.scrollTop<=4)reachedEnd=true;check.disabled=busy||!doc?.configured||!reachedEnd;submit.disabled=check.disabled||!check.checked;dialog.querySelector('.pc-scroll-hint').textContent=reachedEnd?'Документ просмотрен. Подтвердите согласие ниже.':'Прокрутите согласие до конца, чтобы продолжить.';}
 copy.addEventListener('scroll',updateGate);new ResizeObserver(()=>{if(dialog.open)updateGate()}).observe(copy);check.onchange=updateGate;
 async function open(path,trigger){
  if(dialog.open)return;target=safeTarget(path);opener=trigger||document.activeElement;doc=null;reachedEnd=false;copy.scrollTop=0;check.checked=false;check.disabled=true;submit.disabled=true;error.textContent='';copy.textContent='Загружаем документ…';
  dialog.showModal();document.body.classList.add('pc-modal-open');dialog.querySelector('.pc-close').focus();
  const number=++requestNumber;
  try{const response=await fetch('/api/point-consent',{cache:'no-store'});if(!response.ok)throw Error('Не удалось загрузить согласие. Закройте окно и попробуйте ещё раз.');const result=await response.json();if(number!==requestNumber)return;doc=result;copy.replaceChildren();
   const title=document.createElement('h3');title.textContent=doc.title;copy.append(title);
   for(const section of doc.sections){const heading=document.createElement('h4'),text=document.createElement('p');heading.textContent=section.title;text.textContent=section.text;copy.append(heading,text);}
   copy.scrollTop=0;requestAnimationFrame(updateGate);if(!doc.configured)error.textContent='Регистрация откроется после публикации реквизитов оператора. Сейчас можно ознакомиться с проектом согласия.';
  }catch(e){error.textContent=e.message;copy.textContent='Документ недоступен.';}
 }
 form.onsubmit=async event=>{event.preventDefault();if(busy||!doc?.configured||!reachedEnd||!check.checked)return;busy=true;submit.disabled=true;check.disabled=true;error.textContent='';submit.textContent='Сохраняем согласие…';
  try{const response=await fetch('/api/point-consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accepted:true,readToEnd:true,version:doc.version})});const result=await response.json();if(!response.ok||result.accepted!==true)throw Error(result.error||'Не удалось сохранить согласие. Попробуйте ещё раз.');window.location.assign(target);}
  catch(e){error.textContent=e.message;busy=false;check.disabled=false;submit.disabled=!check.checked;submit.textContent='Согласиться и продолжить';}
 };
 document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(!link)return;const url=new URL(link.href,location.href);if(url.origin!==location.origin||!['/account/points/new','/register'].includes(url.pathname))return;if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();event.stopImmediatePropagation();void open('/account/points/new',link);},true);
 if(document.body.hasAttribute('data-point-consent-auto'))void open(safeTarget(new URLSearchParams(location.search).get('returnTo')||'/account/points/new'));
})();

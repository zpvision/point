import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PNG} from 'pngjs';
import {browser} from './design-browser-driver.mjs';
const origin=process.env.APP_URL||'http://localhost:8081';
if(!origin.endsWith(':8081'))throw Error('Use the dedicated browser-test backend at :8081');
const p=await browser(origin+'/login');
const email='design-e2e-'+Date.now()+'@example.test';
const company=process.env.E2E_LEGAL_FORM==='ooo';
async function next(title){await p.wait('!document.querySelector(".assistant-typing")');await p.click('Ответить');await p.wait(`document.querySelector('.current-question h2')?.textContent===${JSON.stringify(title)} && !document.querySelector('.assistant-typing')`)}
async function radio(value){await p.js(`document.querySelector('.form-content [role="radio"][value="${value}"]')?.click()`)}
async function chooseLabel(text){await p.js(`(()=>{const e=[...document.querySelectorAll('.form-content label')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing label');e.click()})()`)}
async function label(text,value){const selector=await p.js(`(()=>{const labels=[...document.querySelectorAll('label')];const label=labels.find(l=>l.textContent.trim()===${JSON.stringify(text)});if(!label)throw Error('Missing label '+${JSON.stringify(text)});const input=label.querySelector('input,textarea');if(!input)throw Error('Missing control');input.setAttribute('data-e2e-field','true');return '[data-e2e-field="true"]'})()`);await p.fill(selector,value);await p.js(`document.querySelector('[data-e2e-field]')?.removeAttribute('data-e2e-field')`)}
try{
 await p.wait('!!document.querySelector(".auth-design")');await p.request('/api/auth/logout','POST',{});await p.goto(origin+'/register');await p.wait('!!document.querySelector(".auth-design")');await p.click('Создать аккаунт');
 for(const [title,value]of [['Как вас зовут?','Сергей'],['Укажите вашу фамилию','Тестовый'],['Укажите номер телефона','+79991234567'],['Укажите e-mail',email],['Придумайте пароль','design-e2e-only-password-27!']]){
  await p.wait(`document.querySelector('.native-details h3')?.textContent===${JSON.stringify(title)}`);await p.fill('.native-details input',value);await p.click('Продолжить');
 }
 await p.wait('!!document.querySelector(".native-details input[type=checkbox]")');await p.js('document.querySelector(".native-details input[type=checkbox]").click()');await p.click('Продолжить');
 await p.wait('!!document.querySelector(".pc-copy")');await p.wait('document.querySelector(".pc-copy h3") || document.querySelector(".pc-copy section") || document.querySelector(".pc-copy").innerText.includes("Кому")');
 await p.js('const n=document.querySelector(".pc-copy");n.scrollTop=n.scrollHeight;n.dispatchEvent(new Event("scroll"))');await p.wait('!document.querySelector(".pc-check input").disabled');await p.js('document.querySelector(".pc-check input").click()');await p.click('Согласиться и продолжить');
 await p.wait('!!document.querySelector(".cabinet-shelf-photo")');await p.goto(origin+'/account/points/new');await p.wait('!!document.querySelector(".chat-header") && !document.querySelector(".assistant-typing")');
 await p.wait('!!document.querySelector(\'.form-content [role=radio][value="ООО"]\')');
 await radio(company?'ООО':'ИП');await next(company?'Введите ИНН организации':'Введите ИНН индивидуального предпринимателя');
 if(company&&await p.js('document.querySelector(".form-content input").maxLength')!==10)throw Error('Company INN must use ten digits');
 await p.fill('.form-content input',company?'7707083893':'500100732259');await p.fill('.form-content label:nth-child(2) input',company?'ООО Тестовое':'ИП Тестовый');await next('Укажите адрес вашей точки');
 await p.fill('.form-content input','Москва, Ленинградский проспект, 36');await next('Где находится вход в Point?');await chooseLabel('С улицы');await next('Как курьеру найти вход?');
 await p.fill('.form-content textarea','Вход с улицы, справа от аптеки');await next('Какой это тип помещения?');await chooseLabel('Магазин');await next('Какие операции доступны в вашей точке?');
 await p.js('document.querySelector(".form-content [role=checkbox]").click()');await next('Сколько посылок можно разместить?');await chooseLabel('до 100');await next('Какой максимальный вес отправления?');await chooseLabel('до 20 кг');await next('Когда работает ваша точка?');
 await next('Покажите, как выглядит ваш Point');
 await mkdir('var/screenshots',{recursive:true});const fixture=new PNG({width:16,height:16});fixture.data.fill(255);await writeFile('var/design-fixture.png',PNG.sync.write(fixture));
 const upload=async()=>{const doc=await p.send('DOM.getDocument');const n=await p.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.upload-zone input[type=file]'});await p.send('DOM.setFileInputFiles',{nodeId:n.nodeId,files:[resolve('var/design-fixture.png')]})};
 await upload();await p.wait('document.querySelectorAll(".form-content .photos figure").length===1');await p.js('document.querySelector(".form-content [data-slot=select-trigger]").click()');await p.js('[...document.querySelectorAll("[role=option]")].find(e=>e.textContent.includes("Помещение внутри")).click()');await upload();await p.wait('document.querySelectorAll(".form-content .photos figure").length===2');
 await p.wait('document.querySelector(".save-status").textContent.includes("Все изменения сохранены")');
 await p.send('Page.reload');await p.wait('document.querySelectorAll(".form-content .photos figure").length===2 && !document.querySelector(".assistant-typing")');
 await next('Кто будет контактным лицом?');await next('Готово! Проверим вашу заявку.');await p.wait('!!document.querySelector(".native-field")');
 if(company){await label('КПП','770701001');await label('ОГРН','1027700132195')}else await label('ОГРНИП','123456789012345');await label('Юридический адрес','Москва, Ленинградский проспект, 36');await label('ФИО руководителя / ИП','Тестовый Сергей');await p.click('Да, всё верно');
 await label('Адрес','Москва, Ленинградский проспект, 36');await p.click('Указать адрес и координаты вручную');await label('Полный адрес','Москва, Ленинградский проспект, 36');await label('Город','Москва');await label('Улица','Ленинградский проспект');await label('Дом','36');
 await label('Широта адреса','55.790');await label('Долгота адреса','37.560');await label('Широта входа','55.791');await label('Долгота входа','37.561');await p.click('Показать расположение');await p.click('Всё верно');
 await p.click('Прочитать проект оферты');await p.js('const copy=document.querySelector(".offer-copy");copy.scrollTop=copy.scrollHeight;copy.dispatchEvent(new Event("scroll"))');await p.wait('!document.querySelector(".point-offer input[type=checkbox]").disabled');await p.js('document.querySelector(".point-offer input[type=checkbox]").click()');await p.click('Подтвердить ознакомление с проектом');await p.wait('document.querySelector(".point-offer").textContent.includes("С проектом ознакомлен")');
 await p.shot('e2e-native-review');await p.click('Завершить заявку');await p.wait('location.pathname==="/account/points" && !!document.querySelector(".single-point")',45000);
 const points=await p.request('/api/points');if(!points.some(x=>x.status==='IN_REVIEW'))throw Error('No native moderation application');
 const drafts=await p.request('/api/cabinet/points');const ready=drafts.find(d=>d.status==='ready');if(!ready)throw Error('No completed presentation record');
 const submitted=await p.request('/api/registration/sessions/'+ready.id);if(submitted.preview['organization.type']!==(company?'ooo':'ip'))throw Error('Wrong organization type reached backend');
 await p.shot('e2e-submitted-account');
 const plan={pointId:ready.id,month:'2026-10',workingDays:22,acceptPerDay:20,issuePerDay:20,storageSlots:50,averageStorageDays:3};await p.request('/api/cabinet/plans','PUT',plan);const persisted=await p.request('/api/cabinet/plans?pointId='+ready.id+'&month=2026-10');if(persisted.plan.workingDays!==22)throw Error('Plan not persisted');
 if(p.errors.length)throw Error(p.errors.join('\n'));console.log('PASS: UI account registration, separate consent, all 12 Point steps, typed organization/address, two categorized photos, offer review, native submission/moderation, persisted plan.');
}catch(e){await p.shot('e2e-failure').catch(()=>{});throw e}finally{p.close()}

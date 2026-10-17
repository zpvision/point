'use strict';
function updateRoute(){const independent=document.getElementById('delivery').value==='Доставка независимым участником';document.getElementById('delivery-info').textContent=independent?'Допущенные независимые участники видят задания на доставку со склада до поинта. Стоимость, срок и подтверждение передачи согласуются до перевозки.':'Уточните, выполняет ли выбранный фулфилмент доставку до нужных поинтов, и согласуйте тариф.';document.getElementById('route-summary').textContent='Твой товар → фулфилмент → '+(independent?'независимый участник':'доставка силами фулфилмента')+' → сеть поинтов Point';}
document.getElementById('delivery').addEventListener('change',updateRoute);
const costIds=['orders','check','cogs','storage','handling','packaging','shipping','pickup','returns','other'];
const costLabels={orders:'Заказов в месяц',check:'Средний чек',cogs:'Себестоимость товара на заказ',storage:'Хранение за месяц',handling:'Обработка на заказ',packaging:'Упаковка на заказ',shipping:'Доставка на заказ',pickup:'Услуги поинта на заказ',returns:'Возвраты за месяц',other:'Другие услуги за месяц'};
const exampleValues={orders:300,check:1500,cogs:900,storage:6000,handling:60,packaging:15,shipping:90,pickup:40,returns:1500,other:3000};
const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(n);
let lastCalculation=null;
function readCalculation(){
 const valid=costIds.every(id=>{const el=document.getElementById(id);return el.value.trim()!==''&&el.checkValidity();});
 if(!valid)return null;
 const v=Object.fromEntries(costIds.map(id=>[id,Number(document.getElementById(id).value)]));
 const services=v.storage+v.orders*(v.handling+v.packaging+v.shipping+v.pickup)+v.returns+v.other;
 const total=services+5000,turnover=v.orders*v.check;
 return {inputs:v,services,total,perOrder:total/v.orders,turnover,share:turnover>0?total/turnover*100:null,contribution:turnover-v.orders*v.cogs-total};
}
function calculateCosts(){
 lastCalculation=readCalculation();
 const r=lastCalculation;
 document.getElementById('per-order').textContent=r?money(r.perOrder):'—';
 document.getElementById('services-total').textContent=r?money(r.services):'—';
 document.getElementById('total-cost').textContent=r?money(r.total):'—';
 document.getElementById('cost-share').textContent=r&&r.share!==null?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(r.share)+' %':'—';
 document.getElementById('contribution').textContent=r?money(r.contribution):'—';
 document.getElementById('cost-status').textContent=r?'Расчёт по введённым значениям, не прогноз и не коммерческое предложение.':'Заполни все поля. Число заказов — целое и больше нуля, суммы — неотрицательные.';
 const alt=document.getElementById('alternative');let comparison='Введи свою сумму для сравнения.';
 if(alt.value!==''){
  if(!alt.checkValidity())comparison='Сумма для сравнения должна быть неотрицательной.';
  else if(!r)comparison='Сначала заполни расходы Point.';
  else{const delta=Number(alt.value)-r.total;comparison=delta>0?'В твоём сценарии расходы с Point ниже на '+money(delta)+' в месяц.':delta<0?'В твоём сценарии расходы с Point выше на '+money(-delta)+' в месяц.':'В твоём сценарии расходы совпадают.';}
 }
 document.getElementById('comparison-result').textContent=comparison;
}
costIds.concat('alternative').forEach(id=>document.getElementById(id).addEventListener('input',calculateCosts));
document.getElementById('cost-form').addEventListener('submit',e=>e.preventDefault());
document.getElementById('builder').addEventListener('submit',e=>e.preventDefault());
document.getElementById('example').addEventListener('click',()=>{Object.entries(exampleValues).forEach(([id,value])=>document.getElementById(id).value=value);calculateCosts();document.getElementById('cost-status').textContent='Загружен условный пример. Это учебные значения, не тарифы партнёров.';});
const stages=[
 ['Товар принят на хранение','Количество принятых единиц, доступный остаток, место хранения и выявленные расхождения.','Фулфилмент','Приёмка и хранение по согласованному тарифу'],
 ['Заказ собран и упакован','Состав заказа, количество списанных единиц, состояние упаковки и готовность к передаче.','Фулфилмент','Обработка и упаковка по согласованному тарифу'],
 ['Отправление в пути','Кто принял посылку, время передачи, маршрут до поинта и согласованный срок доставки.','Фулфилмент или независимый участник','Доставка по согласованному маршруту'],
 ['Посылка принята поинтом','Подтверждение приёмки, состояние упаковки, адрес выдачи и срок хранения.','Поинт сети Point','Приёмка и хранение по условиям выдачи'],
 ['Заказ выдан покупателю','Подтверждение выдачи по коду, время операции и основание начисления за услугу.','Поинт сети Point','Подтверждённая выдача по согласованному тарифу']
];
document.querySelectorAll('[data-stage]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));const s=stages[Number(button.dataset.stage)];['stage-title','stage-text','stage-owner','stage-cost'].forEach((id,i)=>document.getElementById(id).textContent=s[i]);}));
const checks=[...document.querySelectorAll('.checklist input')];checks.forEach(c=>c.addEventListener('change',()=>document.getElementById('readiness').textContent=checks.filter(x=>x.checked).length+' из 6'));
function downloadText(name,text,type){const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.getElementById('download-plan').addEventListener('click',()=>{
 const value=id=>document.getElementById(id).value.trim()||'Не указано';
 const lines=['point. — план запуска бизнеса','Черновик для обсуждения. Договоры не заключены, подключение не выполнено.','',
 'Бизнес: '+value('business'),'Товар: '+value('goods'),'Регион: '+value('region'),'Услуги фулфилмента: '+value('fulfillment'),'Партнёр: '+value('partner'),'Доставка: '+value('delivery'),'Поинты / районы: '+value('points'),'',
 'РАСЧЁТ НА МЕСЯЦ','Значения введены пользователем или взяты из условного примера; не являются утверждёнными тарифами.'];
 costIds.forEach(id=>lines.push(costLabels[id]+': '+value(id)));
 const r=readCalculation();lines.push('Подписка Point: 5 000 ₽ / месяц');
 if(r)lines.push('Услуги: '+money(r.services),'Всего на исполнение: '+money(r.total),'Исполнение одного заказа: '+money(r.perOrder),'Остаток после товара и исполнения: '+money(r.contribution),'Остаток — до налогов, привлечения покупателей и других неучтённых расходов.');else lines.push('Расчёт не завершён: уточните объёмы и тарифы.');
 if(value('alternative')!=='Не указано')lines.push('Расходы другого канала: '+value('alternative'),'Сравнение: '+document.getElementById('comparison-result').textContent);
 lines.push('','ГОТОВНОСТЬ К СТАРТУ');checks.forEach(c=>lines.push((c.checked?'[x] ':'[ ] ')+c.parentElement.textContent.trim()));
 lines.push('','ДО СОГЛАСОВАНИЯ','Уточнить условия доступа, тарифы, сроки операций, порядок расчётов, ответственность, расхождения, возвраты и подтверждение передачи.','Point организует сеть поинтов. Договор на хранение и обработку заключается с выбранным фулфилментом.','Привлечение покупателей и собственный канал продаж остаются задачей селлера.');
 downloadText('Point_План_запуска.txt',lines.join('\n'),'text/plain;charset=utf-8');document.getElementById('download-status').textContent='План подготовлен для скачивания. Ничего не отправлено, договоры не заключены.';
});
calculateCosts();
if(document.modelContext?.registerTool){
 try{Promise.resolve(document.modelContext.registerTool({name:'configure_seller_costs',title:'Рассчитать расходы селлера',description:'Заполняет локальный калькулятор Point и пересчитывает расходы. Не оформляет договоров, заказов или платежей.',inputSchema:{type:'object',properties:Object.fromEntries(costIds.map(id=>[id,{type:id==='orders'?'integer':'number',minimum:id==='orders'?1:0,maximum:id==='orders'?10000000:100000000}])),required:costIds,additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||Object.keys(input).length!==costIds.length||costIds.some(id=>typeof input[id]!=='number'||!Number.isFinite(input[id])||input[id]<(id==='orders'?1:0)||input[id]>(id==='orders'?10000000:100000000)||(id==='orders'&&!Number.isInteger(input[id]))||(id!=='orders'&&Math.abs(input[id]*100-Math.round(input[id]*100))>0.000001)))throw new Error('Некорректные объёмы или суммы');costIds.forEach(id=>document.getElementById(id).value=input[id]);calculateCosts();return {total:lastCalculation.total,perOrder:lastCalculation.perOrder,contribution:lastCalculation.contribution,currency:'RUB',binding:false};}})).catch(()=>{});}catch{}
}

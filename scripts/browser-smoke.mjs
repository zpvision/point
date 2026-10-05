// Browser smoke without a second test framework. Start Edge/Chrome with remote debugging first.
// BROWSER_DEBUG_URL=http://localhost:9223 APP_URL=http://localhost:8080 node scripts/browser-smoke.mjs
import { mkdir, writeFile } from 'node:fs/promises';
const debug = process.env.BROWSER_DEBUG_URL || 'http://localhost:9223';
const origin = process.env.APP_URL || 'http://localhost:8080';
const tabs = await (await fetch(debug + '/json/list')).json();
const tab = tabs.find(t => t.type === 'page');
if (!tab) throw new Error('Open a browser tab first');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let next = 1; const pending = new Map(); const errors = [];
ws.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { const p = pending.get(message.id); pending.delete(message.id); if (message.error) p.reject(new Error(message.error.message)); else p.resolve(message.result); } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text); };
function send(method, params = {}) { const id = next++; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
async function waitFor(expression) { const until = Date.now() + 15000; while (Date.now() < until) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 100)); } throw new Error('Timed out: ' + expression); }
async function navigate(path) { await send('Page.navigate', { url: origin + path }); await waitFor(`document.readyState === 'complete' && !!document.querySelector('h1')`); }
async function fill(selector, value) { await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el)throw new Error('Missing input'); const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true})); })()`); }
async function click(text) { await evaluate(`(() => { const el=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!el)throw new Error('Missing button: '+${JSON.stringify(text)});el.click(); })()`); }
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await navigate('/register'); await waitFor(`document.body.innerText.includes('Как вас зовут?')`);
await mkdir('var/screenshots', { recursive: true });
async function screenshot(name) { const r = await send('Page.captureScreenshot', { format:'png', captureBeyondViewport:false }); await writeFile('var/screenshots/'+name+'.png',Buffer.from(r.data,'base64')); }
await screenshot('register-desktop');
await fill('input', 'Сергей'); await click('Продолжить →'); await waitFor(`document.body.innerText.includes('Укажите вашу фамилию')`);
await fill('input', 'Данилюк'); await click('Продолжить →'); await waitFor(`document.body.innerText.includes('Укажите номер телефона')`);
await fill('input', '+79991234567'); await click('Продолжить →'); await waitFor(`document.body.innerText.includes('Укажите e-mail')`);
await send('Page.reload'); await waitFor(`document.body.innerText.includes('У вас есть незавершённая регистрация')`); await click('Продолжить');
await waitFor(`!!document.querySelector('input[type=email]')`);
await screenshot('register-resume');
await send('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true });
await screenshot('register-mobile');
if (await evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')) throw new Error('Mobile horizontal overflow');
if (errors.length) throw new Error(errors.join('\n'));
console.log('Browser smoke passed: registration, answer progression, persisted refresh, responsive layout; screenshots in var/screenshots.');
ws.close();

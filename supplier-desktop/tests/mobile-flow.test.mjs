// Script-only DOM integration tests. No browser or live financial records.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { unlink } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { fileURLToPath } from 'node:url';
const bundle=new URL('./.app-test.mjs',import.meta.url);
await build({entryPoints:['src/App.jsx'],outfile:fileURLToPath(bundle),bundle:true,platform:'node',format:'esm',external:['react','react-dom'],define:{'import.meta.env.VITE_API_URL':'""'}});
const dom=new JSDOM('<div id="root"></div>',{url:'https://spms.test/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,CustomEvent:dom.window.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
window.matchMedia=()=>({matches:false});window.scrollTo=()=>{};globalThis.confirm=()=>false;
const user={id:1,username:'test',full_name:'Test Staff',role:'admin'};
localStorage.setItem('spms_user',JSON.stringify(user));localStorage.setItem('spms_token','test-only');
const bill={sync_id:'bill-test',supplier_name:'Test Supplier',posting_date:'2026-10-04',bill_date:'2026-10-04',actual_amount:100,total_bill_amount:100,tax_amount:0,tax_percent:0,paid_amount:20,remaining_balance:80,payment_status:'PARTIAL',category:'PAYABLE',payments:[]};
let writes=0,release,savePayloads=[];
globalThis.fetch=async(url,options={})=>{
 if(options.method==='POST') {writes++;savePayloads.push(JSON.parse(options.body));await new Promise(resolve=>release=resolve);return {ok:false,status:503,json:async()=>({error:'Test connection failure'})};}
 return {ok:true,status:200,json:async()=>url.includes('/me')?{user}:url.includes('/users')?{users:[user]}:[bill]};
};
const {createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('root'));
try {
 const {default:App}=await import(bundle.href);
 await act(async()=>{root.render(React.createElement(App));});
 const click=async selector=>{const el=document.querySelector(selector);assert(el,selector);await act(async()=>el.click());};
 await click('.mobile-nav button:nth-child(2)');
 assert(document.querySelector('.mobile-bill-card').textContent.includes('Test Supplier'));
 await click('.bill-card-heading');assert(document.querySelector('.bill-card-details'));
 await click('.bill-card-actions .primary');assert(document.querySelector('[role=dialog]'));
 assert.equal(document.activeElement,document.querySelector('[role=dialog]'));
 await click('.payment-modal > button');assert(!document.querySelector('[role=dialog]'));
 await click('.header-add');assert(document.querySelector('.bill-form'));
 const supplier=document.querySelector('input[list="suppliers-datalist"]');
 await act(async()=>{
   Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(supplier,'Unsaved Supplier');
   supplier.dispatchEvent(new window.Event('input',{bubbles:true}));
 });
 await click('.mobile-nav button:first-child');
 assert(document.querySelector('.bill-form'),'Unsaved changes prevent navigation when confirmation is declined');
 // Native DOM submission drives the app handler; duplicate events share a guard.
 const form=document.querySelector('.bill-form');
 await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});
 assert.equal(writes,1); assert(document.querySelector('.form-actions button').disabled);
 await act(async()=>{release();});
 assert(document.querySelector('.alert-error').textContent.includes('Could not confirm save'));
 assert(document.querySelector('.bill-form'));
 await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});
 assert.equal(writes,2);assert.equal(savePayloads[0].sync_id,savePayloads[1].sync_id,'Retry uses same record identity');
 await act(async()=>{release();});
 await act(async()=>{Object.defineProperty(navigator,'onLine',{value:false,configurable:true});window.dispatchEvent(new window.Event('offline'));});
 assert(document.querySelector('.connection-banner')); assert(document.querySelector('.form-actions button').disabled);
 await act(async()=>window.dispatchEvent(new window.CustomEvent('auth:expired')));
 assert(document.querySelector('.login-form')); assert(!document.querySelector('.mobile-bill-card'));
 console.log('PASS: mobile cards/details/payment modal, form, duplicate-save guard, stable retry identity, offline save block and session cleanup.');
} finally {await act(async()=>root.unmount());await unlink(bundle);dom.window.close();}

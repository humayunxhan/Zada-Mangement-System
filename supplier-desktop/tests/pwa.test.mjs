import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
assert.equal(manifest.display,'standalone');
assert.equal(manifest.scope,'/');
for (const icon of manifest.icons) {
 const data=readFileSync('public'+icon.src); const [w,h]=icon.sizes.split('x').map(Number);
 assert.equal(data.readUInt32BE(16),w); assert.equal(data.readUInt32BE(20),h);
}
assert(existsSync('public/icons/apple-touch-icon.png'));
const handlers = {}, stored = [], removed = [];
let offline = false;
const context = {
 URL,
 self:{location:{origin:'https://spms.zadapharmacy.com'},addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim:async()=>{}}},
 caches:{open:async()=>({add:async url=>stored.push(url)}),keys:async()=>['spms-offline-v0','unrelated'],delete:async key=>removed.push(key),match:async()=>({fallback:true})},
 fetch:async()=>{if(offline)throw Error('offline');return {network:true};},
};
vm.runInNewContext(readFileSync('public/sw.js','utf8'),context);
await new Promise((resolve,reject)=>handlers.install({waitUntil:p=>p.then(resolve,reject)}));
assert.deepEqual(stored,['/offline.html']);
await new Promise((resolve,reject)=>handlers.activate({waitUntil:p=>p.then(resolve,reject)}));
assert.deepEqual(removed,['spms-offline-v0']);
for(const path of ['/api/bills','/api/auth/me','/api/payments']) for(const method of ['GET','POST']) {
 let intercepted=false;
 handlers.fetch({request:{url:context.self.location.origin+path,method,mode:'navigate'},respondWith:()=>{intercepted=true;}});
 assert.equal(intercepted,false,'Private API must never be cached or intercepted');
}
for (const disconnected of [false,true]) {
 offline=disconnected;let result;
 handlers.fetch({request:{url:context.self.location.origin+'/',method:'GET',mode:'navigate'},respondWith:p=>{result=p;}});
 assert.equal((await result)[disconnected?'fallback':'network'],true);
}
console.log('PASS: manifest, icon dimensions, offline fallback, API exclusion, cache isolation.');

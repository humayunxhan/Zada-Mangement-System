const { app, BrowserWindow, ipcMain } = require('electron'); const path=require('path'); const fs=require('fs'); const db=require('./db.cjs');
const baseUrl=process.env.CEO_SERVER_URL||'https://cashbook-e9h7.onrender.com';

require('dotenv').config({ path: path.join(__dirname,'../.env') });

const appDataDir = path.join(app.getPath('appData'), 'ZadaSupplierReconciliation');
app.setPath('userData', appDataDir);
app.setPath('cache', path.join(appDataDir, 'Cache'));
app.setPath('logs', path.join(appDataDir, 'Logs'));

let flushing=false, syncError=null;
async function flush(){
 if(flushing)return; flushing=true;
 try {let job; while((job=db.syncJob())){
   const r=await fetch(baseUrl+'/api/v1/suppliers/snapshot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...JSON.parse(job.payload),pharmacyId:process.env.CEO_PHARMACY_ID||'zada-pharmacy',branchId:process.env.CEO_BRANCH_ID||'main'}),signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw new Error(`${r.status}: ${await r.text()}`);
   db.completeSync(job.id);syncError=null;
 }}catch(e){syncError=e.message;}finally{flushing=false;}
}
app.whenReady().then(async()=>{
 await db.init(app.getPath('userData'));setInterval(flush,15000);void flush();
 const jwt = require('jsonwebtoken');
 const methods = { list: 'list', names: 'names', 'save-bill': 'saveBill', 'delete-bill': 'deleteBill', 'add-payment': 'addPayment', 'delete-payment': 'deletePayment', 'record-event': 'recordEvent', 'sync-status': 'syncStatus', duplicates: 'duplicates', 'export-data': 'exportData', 'backup-list': 'backupList', 'backup-create': 'createBackup', 'backup-download': 'downloadBackup', 'backup-restore': 'restoreBackup', 'audit-list': 'auditList' };
 const admin = new Set(['backup-list','backup-create','backup-download','backup-restore','audit-list']);
 for (const [channel,method] of Object.entries(methods)) ipcMain.handle(`supplier:${channel}`,(_,input,auth)=>{
   try {
     const keys = process.env.JWT_SECRET ? [process.env.JWT_SECRET] : ['zada-pharmacy-supplier-secret-key-2026','zada_spms_secure_token_secret_key_2026_hostinger'];
     let user;
     for (const key of keys) { try { user=jwt.verify(auth?.token || '',key,{algorithms:['HS256']}); break; } catch(e) { if (e.name==='TokenExpiredError' || key===keys.at(-1)) throw e; } }
     if ((admin.has(channel) || channel === 'export-data' && input?.dataset === 'audit') && user.role !== 'admin') throw new Error('Administrator access required.');
     let value;
     if (channel === 'backup-create') value=db.createBackup(user.username);
     else if (channel === 'sync-status') value={...db.syncStatus(),error:syncError};
     else value=db[method](input,user.username);
     if (['save-bill','delete-bill','add-payment','delete-payment','record-event','backup-restore'].includes(channel)) void flush();
     return { ok: true, value };
   } catch(e) { return { ok: false, error: e.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : e.message }; }
 });
 setInterval(() => db.automaticBackup(),60 * 60 * 1000);
 const win=new BrowserWindow({width:1450,height:900,minWidth:1050,minHeight:700,backgroundColor:'#07101f',title:'Zada Pharmacy SPMS',icon:path.join(__dirname,'../build/icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}}); const dist=path.join(__dirname,'../dist/index.html'); if(fs.existsSync(dist))win.loadFile(dist);else win.loadURL('http://localhost:5174');});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

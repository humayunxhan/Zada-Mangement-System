const { app, BrowserWindow, ipcMain } = require('electron'); const path=require('path'); const fs=require('fs'); const db=require('./db.cjs');
require('dotenv').config({ path: path.join(__dirname,'../.env') });

const appDataDir = path.join(app.getPath('appData'), 'ZadaSupplierReconciliation');
app.setPath('userData', appDataDir);
app.setPath('cache', path.join(appDataDir, 'Cache'));
app.setPath('logs', path.join(appDataDir, 'Logs'));

app.whenReady().then(async()=>{
 await db.init(app.getPath('userData'));
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
     else if (channel === 'sync-status') value={...db.syncStatus(),enabled:false,pending:0,error:null};
     else value=db[method](input,user.username);
     return { ok: true, value };
   } catch(e) { return { ok: false, error: e.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : e.message }; }
 });
 setInterval(() => db.automaticBackup(),60 * 60 * 1000);
 const win=new BrowserWindow({width:1450,height:900,minWidth:1050,minHeight:700,backgroundColor:'#07101f',title:'Zada Pharmacy SPMS',icon:path.join(__dirname,'../build/icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}}); const dist=path.join(__dirname,'../dist/index.html'); if(fs.existsSync(dist))win.loadFile(dist);else win.loadURL('http://localhost:5174');});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

const { app, BrowserWindow, ipcMain } = require('electron'); const path=require('path'); const fs=require('fs'); const db=require('./db.cjs');
const baseUrl=process.env.CEO_SERVER_URL||'https://cashbook-e9h7.onrender.com';

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
 ipcMain.handle('supplier:list',(_,f)=>db.list(f));ipcMain.handle('supplier:names',()=>db.names());
 for(const [channel,method] of [['save-bill','saveBill'],['delete-bill','deleteBill'],['add-payment','addPayment'],['delete-payment','deletePayment'],['record-event','recordEvent']]) ipcMain.handle(`supplier:${channel}`,(_,x)=>{const result=db[method](x);void flush();return result;});
 ipcMain.handle('supplier:sync-status',()=>({...db.syncStatus(),error:syncError}));
 const win=new BrowserWindow({width:1450,height:900,minWidth:1050,minHeight:700,backgroundColor:'#07101f',title:'Zada Pharmacy SPMS',icon:path.join(__dirname,'../build/icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}}); const dist=path.join(__dirname,'../dist/index.html'); if(fs.existsSync(dist))win.loadFile(dist);else win.loadURL('http://localhost:5174');});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});

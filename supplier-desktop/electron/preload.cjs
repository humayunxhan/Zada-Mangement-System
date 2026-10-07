const { contextBridge, ipcRenderer } = require('electron');
async function invoke(channel, input, auth) {
  const result=await ipcRenderer.invoke(`supplier:${channel}`,input,auth);
  if (!result.ok) throw new Error(result.error); return result.value;
}
const methods={list:'list',saveBill:'save-bill',deleteBill:'delete-bill',addPayment:'add-payment',deletePayment:'delete-payment',suppliers:'names',recordEvent:'record-event',syncStatus:'sync-status',duplicates:'duplicates',exportData:'export-data',backupList:'backup-list',createBackup:'backup-create',downloadBackup:'backup-download',restoreBackup:'backup-restore',auditList:'audit-list'};
contextBridge.exposeInMainWorld('supplierAPI',Object.fromEntries(Object.entries(methods).map(([name,channel])=>[name,(input,auth)=>invoke(channel,input,auth)])));

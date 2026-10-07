const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('supplierAPI', {
  list: (filters) => ipcRenderer.invoke('supplier:list', filters),
  saveBill: (data) => ipcRenderer.invoke('supplier:save-bill', data),
  deleteBill: (id) => ipcRenderer.invoke('supplier:delete-bill', id),
  addPayment: (data) => ipcRenderer.invoke('supplier:add-payment', data),
  deletePayment: (id) => ipcRenderer.invoke('supplier:delete-payment', id),
  suppliers: () => ipcRenderer.invoke('supplier:names'),
  recordEvent: (data) => ipcRenderer.invoke('supplier:record-event', data),
  syncStatus: () => ipcRenderer.invoke('supplier:sync-status'),
});

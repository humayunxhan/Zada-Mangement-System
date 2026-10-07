import React, { useState } from 'react';
import { api } from '../api';
import { csv, xlsx } from '../../shared/export';
import Feedback from './Feedback';
export function downloadFile(content,name,type) {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function ExportControls({ ids, datasets = ['bills','payments'], filters = {}, disabled = false }) {
  const [dataset,setDataset]=useState(datasets[0]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function run(format) {
    if (busy) return;setBusy(true);setError('');
    try {
      const { rows } = await api.records.exportData({...filters,ids,dataset});
      if (!rows.length) throw new Error('No records match these export filters.');
      const content=format==='csv'?csv(rows,dataset):await xlsx(rows,dataset);
      downloadFile(content,`zada-${dataset}-${new Date().toISOString().slice(0,10)}.${format}`,format==='csv'?'text/csv;charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="export-block"><div className="export-controls">{datasets.length>1&&<label>Export<select aria-label="Export records" value={dataset} disabled={busy} onChange={e=>setDataset(e.target.value)}>{datasets.map(value=><option key={value} value={value}>{({bills:'Bills',payments:'Payments',events:'Return activity',audit:'Audit log'})[value]}</option>)}</select></label>}<button type="button" disabled={busy||disabled} onClick={()=>run('xlsx')}>{busy?'Preparing…':'Export Excel'}</button><button type="button" disabled={busy||disabled} onClick={()=>run('csv')}>Export CSV</button></div>{error&&<Feedback>{error}</Feedback>}</div>;
}

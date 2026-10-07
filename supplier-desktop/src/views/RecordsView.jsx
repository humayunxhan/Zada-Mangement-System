import React, { useEffect, useState } from 'react';
import { api } from '../api';
import Feedback from '../components/Feedback';
import Modal from '../components/Modal';
import ExportControls, { downloadFile } from '../components/ExportControls';
const dates = value => new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Karachi'});
export default function RecordsView({ onChanged }) {
  const [backups,setBackups]=useState({items:[]}),[logs,setLogs]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[restoring,setRestoring]=useState(null),[detail,setDetail]=useState(null),[confirmation,setConfirmation]=useState('');
  const [filters,setFilters]=useState({from:'',to:'',action:'',search:'',limit:'200'});
  async function load() {
    setLoading(true);setError('');
    try { const [b,a]=await Promise.all([api.records.backupList(),api.records.auditList(filters)]);setBackups(b);setLogs(a); }
    catch(e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(()=>{void load();},[]);
  async function action(work) {
    if(busy)return;setBusy(true);setError('');setNotice('');
    try { await work();await load(); } catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  async function importFile(e) {
    const file=e.target.files[0];e.target.value='';if(!file)return;
    try {
      if(file.size>50*1024*1024)throw new Error('Choose a backup smaller than 50 MB.');
      const backup=JSON.parse(await file.text());
      if(backup.format!=='zada-supplier-backup'||backup.version!==1)throw new Error('Choose a Zada supplier backup JSON file.');
      setConfirmation('');setRestoring({backup,label:file.name,date:backup.createdAt});
    }catch(e){setError(e.message);}
  }
  return <section className="records-view"><div className="page-heading"><div><h2>Backups & audit</h2><p>Protect financial records and review changes.</p></div><button disabled={loading||busy} onClick={load}>Refresh</button></div>
    {error&&<Feedback>{error}</Feedback>}{notice&&<Feedback tone="success" onDismiss={()=>setNotice('')}>{notice}</Feedback>}
    <section className="form-section"><div className="section-heading"><h3>Financial backups</h3><span>{backups.schedule||'Daily; latest 30 backups retained'}</span></div><p className="muted">Bills, payments, returns and audit history are included. Accounts and passwords stay unchanged. Download a copy to another drive for device-loss protection.</p>
      {backups.error&&<Feedback>Automatic backup failed: {backups.error}. Create a backup and check the backup folder.</Feedback>}
      <div className="record-actions"><button className="primary" disabled={busy} onClick={()=>action(async()=>{await api.records.createBackup();setNotice('Backup created.');})}>Create backup now</button><label className="file-button">Choose backup to restore<input type="file" accept=".json,application/json" disabled={busy} onChange={importFile}/></label></div>
      <div className="tableWrap"><table className="records-table"><thead><tr><th>Created (Pakistan time)</th><th>File</th><th>Size</th><th>Actions</th></tr></thead><tbody>{backups.items.map(b=><tr key={b.id}><td>{dates(b.createdAt)}</td><td>{b.id}</td><td>{Math.ceil(b.bytes/1024)} KB</td><td><div className="record-actions"><button disabled={busy} onClick={()=>action(async()=>{downloadFile(JSON.stringify(await api.records.downloadBackup(b.id)),b.id,'application/json');})}>Download</button><button disabled={busy} onClick={()=>{setConfirmation('');setRestoring({id:b.id,label:b.id,date:b.createdAt});}}>Restore</button></div></td></tr>)}</tbody></table></div>{!loading&&!backups.items.length&&<p className="muted">No backup files yet. Create your first backup now.</p>}
    </section>
    <section className="form-section"><div className="section-heading"><h3>Change history</h3><span>Latest {filters.limit} matching entries · times shown in Pakistan time</span></div><form className="audit-filters" onSubmit={e=>{e.preventDefault();void load();}}><label>From<input type="date" value={filters.from} onChange={e=>setFilters(f=>({...f,from:e.target.value}))}/></label><label>To<input type="date" min={filters.from} value={filters.to} onChange={e=>setFilters(f=>({...f,to:e.target.value}))}/></label><label>Search<input value={filters.search} placeholder="User, action or record ID" onChange={e=>setFilters(f=>({...f,search:e.target.value}))}/></label><label>Entries<select value={filters.limit} onChange={e=>setFilters(f=>({...f,limit:e.target.value}))}>{[200,500,1000].map(n=><option key={n}>{n}</option>)}</select></label><button disabled={loading}>Apply filters</button></form>
      <ExportControls datasets={['audit']} filters={filters} disabled={loading||!logs.length}/><div className="tableWrap"><table className="records-table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>{logs.map(log=><tr key={log.sync_id}><td>{dates(log.created_at)}</td><td>{log.actor}</td><td>{log.action}</td><td>{log.entity}<small>{log.record_id||'—'}</small></td><td><button onClick={()=>setDetail(log)}>View change</button></td></tr>)}</tbody></table></div>{loading?<p role="status">Loading records…</p>:!logs.length&&<p className="muted">No changes match these filters. Reads and refreshes are not logged.</p>}
    </section>
    {restoring&&<Modal title="Restore financial backup" busy={busy} onClose={()=>setRestoring(null)}><p>This will replace financial records with the backup from {dates(restoring.date)}. A safety backup is created first. Current audit history is retained; protected settlement history cannot be removed.</p><p className="muted">{restoring.label}</p>{error&&<Feedback>{error}</Feedback>}<label>Type RESTORE to confirm<input autoFocus value={confirmation} disabled={busy} onChange={e=>setConfirmation(e.target.value)}/></label><div className="dialog-actions"><button disabled={busy} onClick={()=>setRestoring(null)}>Cancel</button><button className="danger" disabled={busy||confirmation!=='RESTORE'} onClick={()=>action(async()=>{const result=await api.records.restoreBackup(restoring.id?{id:restoring.id}:{backup:restoring.backup});setRestoring(null);setNotice(`Backup restored. Safety copy: ${result.safetyBackup}.`);await onChanged();})}>{busy?'Restoring…':'Restore backup'}</button></div></Modal>}
    {detail&&<Modal title="Audit entry" onClose={()=>setDetail(null)}><p>{detail.action} by {detail.actor} · {dates(detail.created_at)}</p>{[['Before',detail.before_json],['After',detail.after_json],['Details',detail.details_json]].map(([title,json])=><div key={title}><h3>{title}</h3><pre className="audit-json">{(()=>{try{return JSON.stringify(JSON.parse(json||'null'),null,2);}catch{return json;}})()}</pre></div>)}</Modal>}
  </section>;
}

// Local-only UI fixture server. Never included in the deployment allowlist.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist-php');
const bill = { sync_id:'preview-bill', supplier_name:'Preview Medical Supplies', supplier_bill_no:'INV-042', voucher_no:'V-100', posting_date:'2026-10-04', bill_date:'2026-10-04', total_bill_amount:12500, tax_percent:10, tax_amount:1250, actual_amount:11250, paid_amount:2500, remaining_balance:8750, payment_status:'PARTIAL', category:'PAYABLE', remarks:'Local UI preview only', payments:[{sync_id:'preview-payment',payment_date:'2026-10-04',amount:2500,payment_mode:'COUNTER_CASH',reference_no:'',remarks:''}] };
const user = { id:1, username:'preview', full_name:'Preview Administrator', role:'admin', status:'active' };
http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type','application/json');
    if (url.pathname.endsWith('/login')) return res.end(JSON.stringify({token:'local-preview-only',user}));
    if (url.pathname.endsWith('/me')) return res.end(JSON.stringify({user}));
    if (url.pathname.endsWith('/users')) return res.end(JSON.stringify({users:[user]}));
    if (url.pathname.endsWith('/suppliers')) return res.end(JSON.stringify([bill.supplier_name]));
    if (req.method === 'POST') {res.statusCode=503;return res.end(JSON.stringify({error:'Preview: saving is disabled.'}));}
    return res.end(JSON.stringify([bill]));
  }
  const file=path.join(root,url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(root+'/')) {res.statusCode=403;return res.end();}
  try { const data=await readFile(file);res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.webmanifest':'application/manifest+json','.png':'image/png'})[path.extname(file)]||'text/plain');res.end(data); }
  catch {res.statusCode=404;res.end('Not found');}
}).listen(5188,'127.0.0.1',()=>console.log('Local fixture preview: http://127.0.0.1:5188'));

const fs = require('fs'); const path = require('path'); const os = require('os');
module.exports = function cleanup(dir) {
  const root=path.resolve(dir);
  if (path.dirname(root)!==path.resolve(os.tmpdir()) || !path.basename(root).startsWith('zada-')) throw new Error('Refusing to clean up a non-test directory.');
  const backups=path.join(root,'backups');
  if (fs.existsSync(backups)) { for (const name of fs.readdirSync(backups)) { if (!name.startsWith('backup-') || !name.endsWith('.json')) throw new Error('Unexpected file in test backups.'); fs.unlinkSync(path.join(backups,name)); } fs.rmdirSync(backups); }
  for (const name of fs.readdirSync(root).filter(name=>/^supplier-reconciliation\.damaged-\d+\.sqlite$/.test(name))) fs.unlinkSync(path.join(root,name));
  for (const name of ['supplier-reconciliation.sqlite','supplier-reconciliation.sqlite.pending']) if(fs.existsSync(path.join(root,name)))fs.unlinkSync(path.join(root,name));
  fs.rmdirSync(root);
};

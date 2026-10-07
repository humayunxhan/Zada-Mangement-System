const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
function store(directory) {
  const root = path.resolve(directory);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  function target(id) {
    if (!/^backup-[0-9T-Z.-]+-[a-f0-9-]+\.json$/.test(id)) throw new Error('Invalid backup name.');
    const file = path.resolve(root, id);
    if (path.dirname(file) !== root) throw new Error('Invalid backup location.');
    return file;
  }
  function list() {
    return fs.readdirSync(root).filter(id => /^backup-[0-9T-Z.-]+-[a-f0-9-]+\.json$/.test(id)).map(id => {
      const stat = fs.statSync(target(id)); return { id, createdAt: stat.mtime.toISOString(), bytes: stat.size };
    }).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  function write(backup) {
    const id = `backup-${new Date().toISOString().replace(/:/g, '-')}-${crypto.randomUUID()}.json`;
    const file = target(id); fs.writeFileSync(file + '.pending', JSON.stringify(backup), { mode: 0o600 }); fs.renameSync(file + '.pending', file);
    for (const old of list().slice(30)) fs.unlinkSync(target(old.id));
    return { id, createdAt: backup.createdAt };
  }
  function read(id) {
    const file = target(id);
    if (fs.statSync(file).size > 50 * 1024 * 1024) throw new Error('Backup is too large.');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const due = () => !list().length || Date.now() - Date.parse(list()[0].createdAt) >= 24 * 60 * 60 * 1000;
  return { root, list, write, read, due };
}
module.exports = { store };

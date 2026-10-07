const fs = require('fs');
const path = require('path');
const packaged = path.join(__dirname, 'supplier-ledger.cjs');
module.exports = require(fs.existsSync(packaged) ? packaged : '../../server/src/modules/suppliers/ledger.cjs');

const fs = require('fs');
const path = require('path');

const sharedPath = path.join(__dirname, '..', 'node_modules', '@sharkord', 'shared');
const backupPath = sharedPath + '.bak';

try {
  if (!fs.existsSync(sharedPath) && fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, sharedPath);
    console.log('after-pack: restored shared symlink');
  }
} catch (e) {
  console.error('after-pack error', e);
}

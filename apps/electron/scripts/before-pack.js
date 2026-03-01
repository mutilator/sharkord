const fs = require('fs');
const path = require('path');

// during packaging we don't want the workspace symlink at all; remove it
const sharedPath = path.join(__dirname, '..', 'node_modules', '@sharkord', 'shared');
const backupPath = sharedPath + '.bak';

try {
  if (fs.existsSync(sharedPath) && !fs.existsSync(backupPath)) {
    fs.renameSync(sharedPath, backupPath);
    console.log('before-pack: moved shared symlink out of the way');
  }
} catch (e) {
  console.error('before-pack error', e);
}

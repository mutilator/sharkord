const fs = require('fs');
const path = require('path');

(async () => {
  const projectRoot = path.resolve(__dirname, '..');
  const configPath = path.join(projectRoot, '..', 'packages', 'shared', '.eslintrc.json');
  const backupPath = configPath + '.bak';

  try {
    // remove the local copy of shared package we created earlier
    const targetDir = path.join(projectRoot, 'node_modules', '@sharkord', 'shared');
    if (fs.existsSync(targetDir)) {
      const rm = require('child_process').spawnSync;
      rm('rm', ['-rf', targetDir]);
      console.log('after-pack: removed copied shared package', targetDir);
    }

    // restore the full packages directory from its backup tarball
    const packagesDir = path.join(projectRoot, '..', '..', 'packages');
    const packagesBackup = path.join(projectRoot, '..', '..', 'packages-backup.tar.gz');
    if (fs.existsSync(packagesBackup)) {
      const tar = require('child_process').spawnSync;
      tar('tar', ['-xzf', packagesBackup, '-C', packagesDir]);
      fs.unlinkSync(packagesBackup);
      console.log('after-pack: restored packages directory from', packagesBackup);
    }

    // restore shared directory contents from the individual backup tarball we created
    const sharedDir = path.join(projectRoot, '..', '..', 'packages', 'shared');
    const backupTar = path.join(projectRoot, '..', '..', 'packages', 'shared-backup.tar.gz');
    if (fs.existsSync(backupTar)) {
      const tar = require('child_process').spawnSync;
      tar('tar', ['-xzf', backupTar, '-C', sharedDir]);
      fs.unlinkSync(backupTar);
      console.log('after-pack: restored shared package contents from', backupTar);
    }

    if (!fs.existsSync(configPath) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, configPath);
      console.log('after-pack: restored shared .eslintrc.json');
    }
  } catch (e) {
    console.error('after-pack error', e);
  }
})();

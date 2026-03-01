const fs = require('fs');
const path = require('path');

(async () => {
  // temporarily move the .eslintrc out of the shared package so the
  // asar packager never traverses into the workspace directory.
  // electron app root
  const projectRoot = path.resolve(__dirname, '..');
  // shared package is one level above apps/electron
  const configPath = path.join(projectRoot, '..', 'packages', 'shared', '.eslintrc.json');
  const backupPath = configPath + '.bak';

  try {
    if (fs.existsSync(configPath) && !fs.existsSync(backupPath)) {
      fs.renameSync(configPath, backupPath);
      console.log('before-pack: moved shared .eslintrc.json out of the way');
    }

    // We need to hide the whole workspace "packages" directory so electron-
    // builder doesn't stumble over any of the other projects.  First back up
    // the contents to a tarball, then delete everything inside the folder.
    const packagesDir = path.join(projectRoot, '..', '..', 'packages');
    const packagesBackup = path.join(projectRoot, '..', '..', 'packages-backup.tar.gz');
    if (fs.existsSync(packagesDir)) {
      const tar = require('child_process').spawnSync;
      tar('tar', ['-czf', packagesBackup, '-C', packagesDir, '.']);
      console.log('before-pack: backed up packages directory to', packagesBackup);
      for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
        const full = path.join(packagesDir, entry.name);
        if (entry.isDirectory()) {
          // empty the directory but keep it present
          for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
            fs.rmSync(path.join(full, sub.name), { recursive: true, force: true });
          }
        } else {
          fs.rmSync(full, { force: true });
        }
      }
      console.log('before-pack: cleared packages directory contents');
    }

    // clear out everything in the shared package directory so electron-builder
    // won't wander into the monorepo workspace.  We don't actually delete the
    // directory itself (which can be held open by various tools), but we remove
    // every entry inside it, including dotfiles like .prettierrc.json.  Before
    // removing anything, take a tarball backup so we can restore the package
    // after the build.
    const sharedDir = path.join(projectRoot, '..', '..', 'packages', 'shared');
    const sharedBackup = path.join(projectRoot, '..', '..', 'packages', 'shared-backup.tar.gz');
    if (fs.existsSync(sharedDir)) {
      const tar = require('child_process').spawnSync;
      tar('tar', ['-czf', sharedBackup, '-C', sharedDir, '.']);
      console.log('before-pack: backed up shared package to', sharedBackup);
      for (const entry of fs.readdirSync(sharedDir, { withFileTypes: true })) {
        const full = path.join(sharedDir, entry.name);
        fs.rmSync(full, { recursive: true, force: true });
      }
      console.log('before-pack: cleared shared package contents');
    }

  } catch (e) {
    console.error('before-pack error', e);
  }
})();

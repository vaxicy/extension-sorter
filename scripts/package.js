'use strict';

/**
 * Builds the installable `.vsix` and copies it to the default delivery folder.
 *
 * `vsce package` runs `vscode:prepublish` first, so the compiled `out/` is always
 * up to date. The copy exists because uploading to the Marketplace happens in the
 * browser: the file that is uploaded should not be a stale one from an earlier
 * build, so both the project copy and the delivery copy are printed with their
 * timestamps.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const fileName = `${manifest.name}-${manifest.version}.vsix`;
const vsixInProject = path.join(projectRoot, fileName);

/** Kept in sync with `package-output-default-folder-RULE`. */
const deliveryFolder = process.env['EXTENSION_SORTER_DELIVERY_DIR'] ?? 'D:\\迅雷下载\\vibe coding';
const vsixForUpload = path.join(deliveryFolder, fileName);

// Called through node instead of the `vsce.cmd` shim: the project path contains
// spaces and non-ASCII characters, which cmd.exe splits up when it resolves the
// shim ("'D:\迅雷下载\vibe' is not recognized as an internal or external command").
const vsce = path.join(projectRoot, 'node_modules', '@vscode', 'vsce', 'vsce');
if (!fs.existsSync(vsce)) {
  console.error('vsce is not installed. Run "npm install" first.');
  process.exit(1);
}

console.log(`Packaging ${fileName} ...`);
const result = spawnSync(process.execPath, [vsce, 'package'], {
  cwd: projectRoot,
  stdio: 'inherit',
});
if (result.error) {
  console.error(`Could not run vsce: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
if (!fs.existsSync(vsixInProject)) {
  console.error(`vsce reported success but ${vsixInProject} does not exist.`);
  process.exit(1);
}

fs.mkdirSync(deliveryFolder, { recursive: true });
fs.copyFileSync(vsixInProject, vsixForUpload);

const projectStat = fs.statSync(vsixInProject);
const deliveryStat = fs.statSync(vsixForUpload);
const kilobytes = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

console.log(`\n${fileName} is ready:`);
console.log(`  project : ${vsixInProject} (${kilobytes(projectStat.size)}, ${projectStat.mtime.toLocaleString()})`);
console.log(`  upload  : ${vsixForUpload} (${kilobytes(deliveryStat.size)}, ${deliveryStat.mtime.toLocaleString()})`);
console.log('\nUpload it at https://marketplace.visualstudio.com/manage/publishers/lilinhuang');

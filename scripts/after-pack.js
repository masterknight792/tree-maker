'use strict';
/*
 * Runs after electron-builder packs the app (before the installer / portable file is made).
 * It flips Electron "fuses" in the EXE so the shipped program cannot be abused:
 *   - RunAsNode off                    -> the EXE can't be used as a plain Node.js
 *   - NODE_OPTIONS variable off        -> no injecting code with an environment variable
 *   - --inspect flags off              -> no attaching a debugger from the command line
 *   - OnlyLoadAppFromAsar on           -> only the packed app.asar is loaded, not loose folders
 * If anything goes wrong here we only warn: the build itself must not fail because of it.
 */
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  try {
    const mod = await import('@electron/fuses');
    const { flipFuses, FuseVersion, FuseV1Options } = mod.flipFuses ? mod : mod.default;
    const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
    await flipFuses(exe, {
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
    console.log('  • security fuses applied');
  } catch (err) {
    console.warn('  • WARNING: could not apply security fuses:', err && err.message);
  }
};

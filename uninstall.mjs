#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectMode = process.argv.slice(2).includes('--project');
const claudeDir = projectMode ? path.join(process.cwd(), '.claude') : path.join(os.homedir(), '.claude');
const settingsPath = path.join(claudeDir, 'settings.json');

if (!fs.existsSync(settingsPath)) {
  console.log('Nothing to do — ' + settingsPath + ' does not exist.');
  process.exit(0);
}

let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8') || '{}');
} catch (e) {
  console.error('✗ settings.json is not valid JSON — cannot safely modify it.');
  console.error('  File: ' + settingsPath);
  process.exit(1);
}

if (settings.statusLine) {
  fs.copyFileSync(settingsPath, settingsPath + '.bak');
  delete settings.statusLine;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log('✓ Removed the statusLine setting from ' + settingsPath);
  console.log('  (The script at ' + path.join(claudeDir, 'statusline.js') + ' was left in place — delete it manually if you want.)');
} else {
  console.log('No statusLine setting found — nothing changed.');
}

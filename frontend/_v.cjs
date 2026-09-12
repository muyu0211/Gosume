const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const FE = 'D:/Kits/IDE/Gosume/frontend';
const NODE = 'C:/Users/muyu/.workbuddy/binaries/node/versions/22.22.2-3/node.exe';
const SCAN = 'D:/Kits/IDE/Gosume/docs/Gosume苹果风主题/工具/scan-style-violations.mjs';
const lines = [];

fs.writeFileSync(path.join(FE, 'tsconfig.check.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2020', module: 'ESNext', moduleResolution: 'bundler',
    jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true,
    useDefineForClassFields: true, isolatedModules: true, types: ['vite/client'],
  },
  include: ['src/components/editor', 'src/hooks'],
}, null, 2));
try {
  const r = execFileSync('npx.cmd', ['tsc', '-p', 'tsconfig.check.json'],
    { cwd: FE, encoding: 'utf8', timeout: 300000, shell: true });
  lines.push('TSC OK' + (r.trim() ? '\n' + r.trim() : ' (0 errors)'));
} catch (e) {
  const out = ((e.stdout || '') + (e.stderr || ''));
  const errs = out.split('\n').filter((l) => /error TS/.test(l));
  const known = errs.filter((l) => /TS1117/.test(l));
  const unknown = errs.filter((l) => !known.includes(l));
  lines.push('TSC: ' + errs.length + ' errors（已知既有 ' + known.length + '，新增 ' + unknown.length + '）');
  if (unknown.length) lines.push('NEW ERRORS:\n' + unknown.join('\n'));
}

try {
  const r = execFileSync(NODE, ['node_modules/vite/bin/vite.js', 'build'], { cwd: FE, encoding: 'utf8', timeout: 180000 });
  lines.push('BUILD OK ' + ((r.match(/built in ([\d.]+s)/) || [])[1] || ''));
} catch (e) { lines.push('BUILD FAIL\n' + (e.stderr || e.message).slice(0, 500)); }

try {
  execFileSync(NODE, [SCAN, '--out', path.join(FE, '_scan.txt')], { cwd: 'D:/Kits/IDE/Gosume', encoding: 'utf8', timeout: 60000 });
} catch (e) { lines.push('SCAN nonzero (check _scan.txt)'); }

let jsAll = '';
const assets = path.join(FE, 'dist/assets');
for (const f of fs.readdirSync(assets)) if (f.endsWith('.js')) jsAll += fs.readFileSync(path.join(assets, f), 'utf8');
lines.push('hl-row enter anim           ' + (jsAll.includes('hl-row') ? 'OK' : 'MISS'));
lines.push('highlight key builder       ' + (jsAll.includes('highlight:') && jsAll.includes('customHighlight:') && jsAll.includes('skillItem:') ? 'OK' : 'MISS'));

fs.writeFileSync(path.join(FE, '_out.txt'), lines.join('\n'), 'utf8');

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

globalThis.window = globalThis;

test('version.js exposes the build number and date shown in the status bar', () => {
  runInThisContext(readFileSync(new URL('../js/version.js', import.meta.url), 'utf8'), { filename: 'version.js' });
  const { number, date } = window.WebCAD.version;
  assert.match(number, /^\d+\.\d+$/);
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
});

test('the pre-commit hook writes the same version.js shape the app reads', () => {
  const hook = readFileSync(new URL('../.githooks/pre-commit', import.meta.url), 'utf8');
  assert.ok(!hook.includes('\r'), 'hook must keep LF line endings to run under sh');
  assert.match(hook, /cad\.version = \{ number: '\$\{MAJOR\}\.\$\{minor\}', date: '\$\{today\}' \};/);
  const versionFile = readFileSync(new URL('../VERSION', import.meta.url), 'utf8');
  assert.ok(!versionFile.includes('\r'), 'VERSION must keep LF line endings to source under sh');
  assert.match(versionFile, /^MAJOR=\d+$/m);
  assert.match(versionFile, /^BASE=\d+$/m);
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(index.includes('js/version.js'), 'index.html loads version.js');
  assert.ok(index.includes('id="appVersion"'), 'status bar has the version label');
});

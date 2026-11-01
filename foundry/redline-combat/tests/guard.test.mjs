import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {CLIENT_FILES,freshnessVerdict,refreshClientFiles} from '../scripts/guard.js';

const moduleRoot=new URL('../',import.meta.url);
const manifest=async()=>JSON.parse(await readFile(new URL('module.json',moduleRoot),'utf8'));

test('code that matches the installed release is left alone', () => {
  assert.equal(freshnessVerdict({loadedVersion:'0.5.1',installedVersion:'0.5.1',attemptedVersion:null}),'current');
  assert.equal(freshnessVerdict({loadedVersion:'0.5.1',installedVersion:'0.5.1',attemptedVersion:'0.5.1'}),'current');
  assert.equal(freshnessVerdict({loadedVersion:'0.5.1',installedVersion:undefined,attemptedVersion:null}),'current');
});

test('older or unreadable code is refreshed once per installed release, then reported instead of looping', () => {
  for (const loadedVersion of ['0.4.0',undefined]) {
    assert.equal(freshnessVerdict({loadedVersion,installedVersion:'0.5.1',attemptedVersion:null}),'refresh');
    assert.equal(freshnessVerdict({loadedVersion,installedVersion:'0.5.1',attemptedVersion:'0.5.0'}),'refresh');
    assert.equal(freshnessVerdict({loadedVersion,installedVersion:'0.5.1',attemptedVersion:'0.5.1'}),'stuck');
  }
});

test('refresh fetches every client file past the cache, relative to the module root', async () => {
  const calls=[];
  await refreshClientFiles('https://vtt.example/prefix/modules/redline-combat/',async (url,init) => { calls.push([String(url),init.cache]); });
  assert.deepEqual(calls.map(([url]) => url),CLIENT_FILES.map(file => `https://vtt.example/prefix/modules/redline-combat/${file}`));
  assert.ok(calls.every(([,cache]) => cache==='reload'));
});

test('one unreachable file does not stop the refresh', async () => {
  let calls=0;
  await refreshClientFiles('https://vtt.example/modules/redline-combat/',async () => { if (++calls===1) throw new Error('offline'); });
  assert.equal(calls,CLIENT_FILES.length);
});

test('the refresh list covers every script, style and template the client loads', async () => {
  const files=[];
  for (const dir of ['scripts','styles','templates']) {
    for (const name of await readdir(new URL(`${dir}/`,moduleRoot))) files.push(`${dir}/${name}`);
  }
  assert.deepEqual([...CLIENT_FILES].sort(),files.sort());
});

test('main.js reports the release it belongs to', async () => {
  const main=await readFile(new URL('scripts/main.js',moduleRoot),'utf8');
  assert.equal(main.match(/^export const CODE_VERSION = '([^']+)';$/m)?.[1],(await manifest()).version);
});

test('the guard loads first and has no static imports, so stale neighbours cannot stop it', async () => {
  assert.equal((await manifest()).esmodules[0],'scripts/guard.js');
  const guard=await readFile(new URL('scripts/guard.js',moduleRoot),'utf8');
  assert.doesNotMatch(guard,/^\s*import\s/m);
});

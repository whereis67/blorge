const { store, makeUser, chromium } = require('./fake.js'); const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const A = await makeUser(b, 'uA', 'Ada', html), B = await makeUser(b, 'uB', 'Bo', html);
  await A.goto('http://app.local/#create'); await sleep(2500);
  await A.evaluate(() => [...document.querySelectorAll('.create-opt')].find((x) => x.textContent.includes('New Team Project')).click()); await sleep(500);
  await A.screenshot({ path: 'shots/team-new.png' });
  await A.evaluate(() => { const s = document.querySelector('.modal select'); s.value = '3d'; s.dispatchEvent(new Event('change')); });
  await A.evaluate(() => [...document.querySelectorAll('.modal-foot button')].find((x) => x.textContent.includes('Create team')).click()); await sleep(4500);
  const tid = (await A.evaluate(() => location.hash)).replace('#team-', ''); console.log('tid', tid, 'A errs', A.errs);
  await B.goto('http://app.local/#team-' + tid); await sleep(2500); await B.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Join and open')).click()); await sleep(4500);
  const objs = (P) => P.evaluate(() => [...document.querySelectorAll('.vp-side .tool, .vp-toolbar')].length);
  // A adds a sphere
  await A.evaluate(() => [...document.querySelectorAll('.vp-toolbar button')].find((x) => x.textContent.includes('Add object')).click()); await sleep(400);
  await A.evaluate(() => [...document.querySelectorAll('.modal .lib-item')].find((x) => x.textContent.includes('Sphere')).click()); await sleep(3000);
  const sceneObjs = () => Object.keys((store.get('teams/' + tid + '/parts/_scene') || {}).objs || {}).length;
  console.log('scene objs in db:', sceneObjs());
  await B.evaluate(() => [...document.querySelectorAll('.vp-side .ed-tabs button')].find((x) => x.textContent === 'Scene').click()); await sleep(500);
  console.log('B hierarchy:', await B.evaluate(() => [...document.querySelectorAll('.hier-row')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()).join(' | ')));
  // B recolors the sphere via properties -> A sees
  await B.evaluate(() => [...document.querySelectorAll('.hier-row button.grow')].find((x) => x.textContent.includes('Sphere')).click()); await sleep(300);
  await B.evaluate(() => [...document.querySelectorAll('.vp-side .ed-tabs button')].find((x) => x.textContent === 'Properties').click()); await sleep(300);
  await B.evaluate(() => { const i = document.querySelector('.props input[type=color]'); i.value = '#ff0000'; i.dispatchEvent(new Event('change')); }); await sleep(2500);
  await A.evaluate(() => [...document.querySelectorAll('.vp-side .ed-tabs button')].find((x) => x.textContent === 'Scene').click()); await sleep(400);
  await A.evaluate(() => [...document.querySelectorAll('.hier-row button.grow')].find((x) => x.textContent.includes('Sphere')).click()); await sleep(300);
  await A.evaluate(() => [...document.querySelectorAll('.vp-side .ed-tabs button')].find((x) => x.textContent === 'Properties').click()); await sleep(300);
  console.log('A sees sphere color:', await A.evaluate(() => document.querySelector('.props input[type=color]').value));
  await A.screenshot({ path: 'shots/team-3d.png' });
  // B leaves via panel
  await B.evaluate(() => document.querySelector('.mb-item[aria-label="Team and chat"]').click()); await sleep(300);
  await B.evaluate(() => [...document.querySelectorAll('.team-panel .seg button')].find((x) => x.textContent === 'People').click()); await sleep(400);
  await B.evaluate(() => [...document.querySelectorAll('.team-panel button')].find((x) => x.textContent.includes('Leave team')).click()); await sleep(400);
  await B.evaluate(() => [...document.querySelectorAll('.modal-foot button')].find((x) => x.textContent === 'Leave').click()); await sleep(2500);
  console.log('B hash after leave', await B.evaluate(() => location.hash), 'members', Object.keys(store.get('teams/' + tid).members));
  await B.screenshot({ path: 'shots/team-list.png' });
  // owner deletes
  await A.evaluate(() => document.querySelector('.mb-item[aria-label="Team and chat"]').click()); await sleep(300);
  console.log('errs', A.errs, B.errs);
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });

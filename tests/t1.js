const { store, makeUser, chromium } = require('./fake.js'); const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const A = await makeUser(b, 'uA', 'Ada', html), B = await makeUser(b, 'uB', 'Bo', html);
  await A.goto('http://app.local/#create'); await sleep(2500);
  // Ada opens the platformer template and starts a team
  await A.evaluate(() => document.querySelectorAll('.tpl')[0].click()); await sleep(2500);
  await A.evaluate(() => [...document.querySelectorAll('.mb-item')].find((x) => x.textContent.startsWith('File')).click());
  await A.evaluate(() => [...document.querySelectorAll('.mb-menu button')].find((x) => x.textContent.includes('Start a team')).click()); await sleep(500);
  await A.evaluate(() => [...document.querySelectorAll('.modal-foot button')].find((x) => x.textContent.includes('Start team')).click()); await sleep(3500);
  const tid = await A.evaluate(() => location.hash); console.log('A hash', tid, 'A errs', A.errs);
  const teamId = tid.replace('#team-', '');
  console.log('team doc', JSON.stringify(store.get('teams/' + teamId)).slice(0, 200));
  console.log('parts', [...store.keys()].filter((k) => k.startsWith('teams/' + teamId + '/parts')).map((k) => k.split('/').pop()).join(','));
  await A.screenshot({ path: 'shots/team-A1.png' });
  // Bo joins
  await B.goto('http://app.local/#team-' + teamId); await sleep(3000);
  await B.screenshot({ path: 'shots/team-B0.png' });
  await B.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Join and open')).click()); await sleep(4000);
  console.log('B hash', await B.evaluate(() => location.hash), 'B errs', B.errs);
  console.log('members', JSON.stringify(store.get('teams/' + teamId).members));
  const blocksA = () => A.evaluate(() => Blockly.getMainWorkspace().getAllBlocks(false).length), blocksB = () => B.evaluate(() => Blockly.getMainWorkspace().getAllBlocks(false).length);
  console.log('initial blocks A/B', await blocksA(), await blocksB());
  // Ada adds a block (say) to the end of the first script on the selected sprite
  await A.evaluate(() => { const ws = Blockly.getMainWorkspace(); const top = ws.getTopBlocks(true)[0]; const nb = ws.newBlock('looks_say'); nb.initSvg(); nb.render(); top.nextConnection.connect(nb.previousConnection); });
  await sleep(2500);
  console.log('after A edit: A/B blocks', await blocksA(), await blocksB());
  // Bo selects a different sprite (Coin), adds a block; Ada should not see it unless she selects Coin
  await B.evaluate(() => { [...document.querySelectorAll('.sprite-tile .st-hit')].find((x) => x.title === 'Coin').click(); }); await sleep(800);
  await B.evaluate(() => { const ws = Blockly.getMainWorkspace(); const top = ws.getTopBlocks(true)[0]; const nb = ws.newBlock('looks_think'); nb.initSvg(); nb.render(); top.nextConnection.connect(nb.previousConnection); });
  await sleep(2500);
  await A.evaluate(() => { [...document.querySelectorAll('.sprite-tile .st-hit')].find((x) => x.title === 'Coin').click(); }); await sleep(1000);
  console.log('A viewing Coin has looks_think:', await A.evaluate(() => Blockly.getMainWorkspace().getAllBlocks(false).some((x) => x.type === 'looks_think')));
  // concurrent edits in the SAME sprite, different scripts: both add a new top-level script
  await A.evaluate(() => { const ws = Blockly.getMainWorkspace(); const nb = ws.newBlock('event_key'); nb.initSvg(); nb.render(); nb.moveBy(40, 600); });
  await B.evaluate(() => { const ws = Blockly.getMainWorkspace(); const nb = ws.newBlock('event_clicked'); nb.initSvg(); nb.render(); nb.moveBy(300, 650); });
  await sleep(3000);
  const types = (P) => P.evaluate(() => Blockly.getMainWorkspace().getTopBlocks(false).map((x) => x.type).sort().join(','));
  console.log('A tops:', await types(A)); console.log('B tops:', await types(B));
  // title change
  await B.evaluate(() => { const i = document.querySelector('.ed-title'); i.value = 'Renamed by Bo'; i.dispatchEvent(new Event('input')); }); await sleep(2500);
  console.log('A title:', await A.evaluate(() => document.querySelector('.ed-title').value));
  // chat + presence
  await A.evaluate(() => document.querySelector('.mb-item[aria-label="Team and chat"]').click()); await sleep(500);
  await A.evaluate(() => { const t = document.querySelector('.team-panel textarea'); t.value = 'hello team!'; t.dispatchEvent(new Event('input')); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); }); await sleep(1500);
  await B.evaluate(() => document.querySelector('.mb-item[aria-label="Team and chat"]').click()); await sleep(800);
  console.log('B chat text:', await B.evaluate(() => document.querySelector('.team-panel .asst-log').innerText.replace(/\n/g, ' | ')));
  await A.screenshot({ path: 'shots/team-A2.png' }); await B.screenshot({ path: 'shots/team-B2.png' });
  console.log('A peers UI:', await A.evaluate(() => document.querySelector('.peers').children.length), 'errs', A.errs, B.errs);
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });

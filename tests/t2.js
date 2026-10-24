const { store, makeUser, chromium } = require('./fake.js'); const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const A = await makeUser(b, 'uA', 'Ada', html, { lag: 150 }), B = await makeUser(b, 'uB', 'Bo', html, { lag: 400 }), C = await makeUser(b, 'uC', 'Cy', html);
  await A.goto('http://app.local/#create'); await sleep(2500);
  await A.evaluate(() => document.querySelectorAll('.tpl')[1].click()); await sleep(2500);   // shooter
  await A.evaluate(() => [...document.querySelectorAll('.mb-item')].find((x) => x.textContent.startsWith('File')).click());
  await A.evaluate(() => [...document.querySelectorAll('.mb-menu button')].find((x) => x.textContent.includes('Start a team')).click()); await sleep(400);
  await A.evaluate(() => [...document.querySelectorAll('.modal-foot button')].find((x) => x.textContent.includes('Start team')).click()); await sleep(3500);
  const tid = (await A.evaluate(() => location.hash)).replace('#team-', '');
  const join = async (P) => { await P.goto('http://app.local/#team-' + tid); await sleep(2500); await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Join and open')).click()); await sleep(3500); };
  await join(B);
  // --- spurious writes: count writes while Bo just browses sprites, no edits
  let writes = 0; const origSet = Map.prototype.set; 
  const snap = () => JSON.stringify([...store.entries()].filter(([k]) => k.startsWith('teams/' + tid + '/parts')));
  const before = snap();
  for (const nm of ['Laser', 'Asteroid', 'Rocket']) { await B.evaluate((n) => [...document.querySelectorAll('.sprite-tile .st-hit')].find((x) => x.title === n).click(), nm); await sleep(700); }
  await B.evaluate(() => [...document.querySelectorAll('.sprite-tile .st-hit')].find((x) => x.title === 'Rocket').click()); await sleep(800);
  console.log('browse-only writes (should be same):', before === snap());
  if (before !== snap()) { const a = JSON.parse(before), c = JSON.parse(snap()); for (let i = 0; i < c.length; i++) if (JSON.stringify(a[i]) !== JSON.stringify(c[i])) console.log(' changed part', c[i][0], JSON.stringify(c[i][1].scripts ? Object.keys(c[i][1].scripts) : '').slice(0, 100)); }
  // --- viewer role: set Cy as viewer then Cy joins
  store.get('teams/' + tid).open = 'view';
  await join(C);
  console.log('Cy role:', store.get('teams/' + tid).members.uC.role, 'banner:', await C.evaluate(() => document.querySelector('.ed-banner').innerText.slice(0, 60)));
  const parts0 = snap();
  await C.evaluate(() => { const ws = Blockly.getMainWorkspace(); const nb = ws.newBlock('looks_say'); nb.initSvg(); nb.render(); ws.getTopBlocks(true)[0].nextConnection.connect(nb.previousConnection); }); await sleep(2000);
  console.log('viewer edit did NOT write:', parts0 === snap());
  // owner promotes Cy to editor via UI select
  await A.evaluate(() => document.querySelector('.mb-item[aria-label="Team and chat"]').click()); await sleep(400);
  await A.evaluate(() => [...document.querySelectorAll('.team-panel .seg button')].find((x) => x.textContent === 'People').click()); await sleep(500);
  await A.evaluate(() => { const sel = [...document.querySelectorAll('.team-panel select')].find((s) => s.getAttribute('aria-label') === 'Role for Cy'); sel.value = 'editor'; sel.dispatchEvent(new Event('change')); }); await sleep(1500);
  console.log('Cy now:', store.get('teams/' + tid).members.uC.role, '| Cy banner hidden:', await C.evaluate(() => document.querySelector('.ed-banner').hidden));
  await A.screenshot({ path: 'shots/team-people.png' });
  // --- same-script conflict: A and B both edit Rocket's first script at once (last writer wins, no crash/loop)
  await A.evaluate(() => [...document.querySelectorAll('.sprite-tile .st-hit')].find((x) => x.title === 'Rocket').click()); await sleep(500);
  await Promise.all([
    A.evaluate(() => { const ws = Blockly.getMainWorkspace(); const nb = ws.newBlock('looks_say'); nb.initSvg(); nb.render(); ws.getTopBlocks(true)[0].nextConnection.connect(nb.previousConnection); }),
    B.evaluate(() => { const ws = Blockly.getMainWorkspace(); const nb = ws.newBlock('looks_think'); nb.initSvg(); nb.render(); ws.getTopBlocks(true)[0].nextConnection.connect(nb.previousConnection); })]);
  await sleep(4000);
  const sig = (P) => P.evaluate(() => Blockly.getMainWorkspace().getTopBlocks(true).map((t) => { const o = []; let x = t; while (x) { o.push(x.type); x = x.getNextBlock(); } return o.slice(0, 3).join('>'); }).join(' | '));
  const sa = await sig(A), sb = await sig(B); console.log('conflict A:', sa); console.log('conflict B:', sb, '| converged:', sa === sb);
  // --- add sprite on A -> appears on B; delete -> disappears
  await A.evaluate(() => { const f = document.querySelector('.sprite-pane .fab-item[title="Surprise"]'); f.click(); }); await sleep(3500);
  const names = (P) => P.evaluate(() => [...document.querySelectorAll('.sprite-tile .st-hit')].map((x) => x.title).join(','));
  console.log('sprites A:', await names(A)); console.log('sprites B:', await names(B));
  // variable
  await A.evaluate(() => { const ws = Blockly.getMainWorkspace(); ws.createVariable('lasers', '', 'var_lasers_1'); const sets = ws.newBlock('variables_set'); }); 
  await A.evaluate(() => { const ws = Blockly.getMainWorkspace(); const s = ws.newBlock('variables_set'); s.getField('VAR').setValue('var_lasers_1'); s.initSvg(); s.render(); ws.getTopBlocks(true)[0].nextConnection.connect(s.previousConnection); }); await sleep(3500);
  console.log('B has variable lasers:', await B.evaluate(() => Blockly.getMainWorkspace().getAllVariables().map((v) => v.name).join(',')));
  console.log('errs', A.errs, B.errs, C.errs);
  await b.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });

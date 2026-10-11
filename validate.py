import os, shutil
from playwright.sync_api import sync_playwright
BASE_URL=os.environ.get('REDLINE_BASE_URL','http://127.0.0.1:8765').rstrip('/')
from pathlib import Path
import json
r=Path(__file__).parent;checks=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=(os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')),headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1366,'height':768});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def fresh():page.goto(BASE_URL+'/prototype/?reset=1');page.wait_for_selector('.dock');page.evaluate("history.replaceState(null,'',location.pathname)")
 def state():return page.evaluate('window.redline.getState()')
 def click(action):page.locator('[data-action="'+action+'"]').first.click()
 def ok(name,cond):
  assert cond,name
  checks.append({'check':name,'status':'passed'})
 fresh();click('attack');ok('Preview does not consume ammunition',state()['ammo']==8);click('close');ok('Cancel preview does not consume ammunition',state()['ammo']==8)
 click('attack');page.locator('[data-action="execute"]').dblclick();ok('Double execution consumes one cartridge',state()['ammo']==7 and state()['request']['phase']=='awaiting-defense')
 pub=page.evaluate('window.redline.publicDefense()');ok('Public projection omits totals and DV',all(k not in pub for k in ['attackTotal','dv','result','hp']))
 rid=state()['request']['id'];click('reconnect');page.wait_for_selector('.sheet');ok('Reload restores pending request',state()['request']['id']==rid and state()['request']['phase']=='awaiting-defense')
 click('decline');ok('Decline leads to resolved demo result',state()['request']['phase']=='resolved');ok('Player cannot apply target changes',page.locator('[data-action="apply"]').is_disabled())
 page.locator('#role').select_option('gm');page.locator('[data-action="apply"]').dblclick();ok('Repeated apply applies once in one tab',state()['appliedCount']==1);page.reload();ok('Applied ID survives reload',state()['appliedCount']==1 and state()['request']['phase']=='applied');click('next');ok('Completed request advances turn',state()['turn']==1 and state()['request'] is None)
 fresh();click('attack');click('execute');click('evade');ok('Evasion demo branches to dodged',state()['request']['result']=='dodged')
 fresh();click('settings');click('empty-ammo');click('close');click('attack');ok('Empty magazine blocks execution',page.locator('[data-action="execute"]').is_disabled());click('close');click('reload');ok('Demo reload restores magazine',state()['ammo']==8)
 fresh();click('settings');page.locator('[data-field="knownDv"]').uncheck();click('close');click('attack');ok('Unknown DV blocks execution',page.locator('[data-action="execute"]').is_disabled())
 fresh();click('settings');page.locator('[data-field="hidden"]').check();click('close');click('attack');ok('Hidden target absent and execution blocked',page.locator('.map-token.enemy').count()==0 and page.locator('[data-action="execute"]').is_disabled())
 fresh();page.locator('[aria-label="Выбрать Никс"]').click();ok('Actor without weapon cannot prepare attack',page.locator('[data-action="attack"]').is_disabled());ok('Selection does not change active turn',state()['turn']==0 and state()['selected']=='n')
 fresh();click('settings');page.locator('[data-field="empty"]').check();click('close');ok('Empty combat has no queue and no attack',page.locator('.queue .unit').count()==0 and page.locator('[data-action="attack"]').count()==0)
 fresh();click('settings');page.locator('[data-field="many"]').check();page.locator('[data-field="long"]').check();page.locator('[data-field="scale"]').select_option('1.25');page.locator('[data-field="position"]').select_option('left');page.locator('[data-field="motion"]').uncheck();click('close');ok('24 participants available',page.locator('.queue .unit').count()==24);ok('Long queue stays within initiative bar',page.locator('.queue').bounding_box()['y']>=page.locator('.initiative').bounding_box()['y']);ok('Full long name preserved as tooltip',len(page.locator('.queue .unit').first.get_attribute('title'))>40);ok('Long names and 125% scale do not widen viewport',page.evaluate('document.documentElement.scrollWidth')==1366);page.screenshot(path=str(r/'renders'/'stress-1366.png'));page.reload();ok('Layout and reduced motion persist',state()['position']=='left' and state()['scale']==1.25 and not state()['motion']);click('attack');ok('Panel placed left',page.locator('.sheet').bounding_box()['x']==20)
 click('close');click('expand');ok('Collapse state toggles',state()['collapsed']);click('expand');ok('Reopening dock retains actor',state()['selected']=='v');
 for i in range(5):click('attack');click('close')
 click('attack');click('execute');ok('Repeated reopening does not duplicate handlers',state()['ammo']==7)
 fresh();click('net');before=page.locator('.nodes').get_attribute('class');click('flat');ok('NET switches to flat presentation',page.locator('.nodes').get_attribute('class')!=before);ok('NET does not alter turn or ammunition',state()['ammo']==8 and state()['turn']==0)
 fresh();click('attack');page.locator('#fire-mode').select_option('aimed');ok('Unimplemented aimed execution blocked',page.locator('[data-action="execute"]').is_disabled())
 ok('No browser JavaScript exceptions',not errors)
 b.close()
(r/'validation.json').write_text(json.dumps({'checks':checks,'passed':len(checks),'failed':0,'scope':'Browser demonstration only; no Foundry or multi-client authority test'},ensure_ascii=False,indent=2));print('PASSED',len(checks))

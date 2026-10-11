import os, shutil
from playwright.sync_api import sync_playwright
BASE_URL=os.environ.get('REDLINE_BASE_URL','http://127.0.0.1:8765').rstrip('/')
from pathlib import Path
import json
r=Path(__file__).parent
errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=(os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1920,'height':1080},device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)))
 for screen in ['overview','initiative','attack','defense','result','gm','net']:
  page.goto(BASE_URL+'/prototype/?reset=1&screen='+screen);page.wait_for_timeout(250)
  page.screenshot(path=str(r/'renders'/('redline-'+screen+'-1920.png')))
  print(screen,'height',page.locator('body').bounding_box()['height'],'scroll',page.evaluate('document.documentElement.scrollWidth'))
 for screen in ['overview','initiative','attack','defense','result','gm','net']:
  page.set_viewport_size({'width':1366,'height':768});page.goto(BASE_URL+'/prototype/?reset=1&screen='+screen);page.wait_for_timeout(150);page.screenshot(path=str(r/'renders'/('redline-'+screen+'-1366.png')))
 for name in ['combat-hud','combat-hud-skills','token-action-hud','evasion']:
  page.set_viewport_size({'width':1920,'height':1080});page.goto(BASE_URL+'/reconstructions/'+name+'.html');page.wait_for_timeout(300);page.screenshot(path=str(r/'renders'/('source-'+name+'-1920.png')))
 (r/'renders'/'browser-errors.json').write_text(json.dumps(errors));print('errors',errors)
 b.close()

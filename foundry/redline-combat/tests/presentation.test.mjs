import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectedWeapon,safeInsets,skillPopupHeight,skillPopupLayout,normalizeInterfaceScale,panelSizing} from '../scripts/presentation.js';

test('weapon selection is read-only, exact, and falls back after deletion or unequipping', () => {
  const weapons=Object.freeze([Object.freeze({id:'a'}),Object.freeze({id:'b'})]);
  const model=Object.freeze({weapons,selectedWeaponId:'b'});
  assert.equal(selectedWeapon(model),weapons[1]);
  assert.equal(selectedWeapon({...model,selectedWeaponId:'gone'}),weapons[0]);
  assert.equal(selectedWeapon({weapons:[],selectedWeaponId:'b'}),null);
  assert.equal(selectedWeapon(),null);
  assert.equal(model.selectedWeaponId,'b');
});

test('outer Foundry template carries the compatibility marker before host observers inspect the inserted HUD', async () => {
  const template=await readFile(new URL('../templates/hud.hbs',import.meta.url),'utf8');
  const root=template.match(/<section\b[^>]*id="redline-combat-hud"[^>]*>/)?.[0];
  assert.ok(root);
  assert.match(root,/class="[^"]*\bredline-blackglass\b[^"]*"/);
  assert.match(root,/data-layout="blackglass-dock"/);
});

const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
test('safe dock insets reserve the actual Foundry controls, sidebar, top bar, and macro bar', () => {
  assert.deepEqual(safeInsets({width:1680,height:940,controls:rect(8,75,48,500),sidebar:rect(1260,75,410,855),hotbar:rect(70,880,1000,50),hostBar:rect(0,0,1680,62)}),{left:68,right:432,top:74,bottom:70});
});
test('collapsed sidebar and hidden hotbar reclaim map space; unrelated and offscreen rectangles are ignored', () => {
  assert.deepEqual(safeInsets({width:1280,height:720,sidebar:rect(1240,70,30,600),hotbar:rect(0,0,0,0),controls:rect(-100,0,20,20),navigation:rect(70,10,500,35)}),{left:12,right:52,top:57,bottom:14});
  assert.deepEqual(safeInsets({width:1280,height:720,sidebar:rect(0,20,400,500),hotbar:rect(20,20,600,40)}),{left:12,right:12,top:12,bottom:14});
});
test('pathological host sizes cannot push dock edges beyond the viewport reserve limits', () => {
  const insets=safeInsets({width:800,height:600,controls:rect(0,0,780,600),sidebar:rect(450,0,350,600),hotbar:rect(0,340,800,260),hostBar:rect(0,0,800,580)});
  assert.ok(insets.left<=Math.round(800/3));
  assert.ok(insets.right<=400);
  assert.ok(insets.top<=200);
  assert.ok(insets.bottom<=200);
});

test('skills popup remains between the initiative queue and dock on the live 1024×768 geometry', () => {
  const dockTop=383,queueBottom=150;
  const height=skillPopupHeight({dockTop,queueBottom,viewportHeight:768});
  assert.equal(height,213);
  assert.equal(dockTop-8-height,queueBottom+12);
  assert.ok(height<768*.42);
});
test('skills popup height follows dock expansion, respects its wide-screen cap, and handles no free gap', () => {
  assert.equal(skillPopupHeight({dockTop:700,queueBottom:150,viewportHeight:1080}),330);
  assert.equal(skillPopupHeight({dockTop:480,queueBottom:150,viewportHeight:720}),302);
  assert.equal(skillPopupHeight({dockTop:160,queueBottom:150,viewportHeight:600}),0);
  assert.equal(skillPopupHeight(),0);
});

test('running DEADLINE above the queue reserves its actual height on the live 1672×941 geometry', () => {
  const base={width:1672,height:941,hostBar:rect(0,0,1672,48),controls:rect(8,70,42,600),sidebar:rect(1362,50,300,880),queueHeight:80};
  const original=safeInsets(base);
  const timer=Object.freeze(rect(1052,58,300,54));
  const running=safeInsets({...base,timer});
  assert.equal(original.top,60);
  assert.equal(running.top,124);
  assert.equal(running.top-timer.bottom,12);
  assert.equal(safeInsets(base).top,60,'unmounted timer releases the queue position');
});
test('timer drag affects the queue only when rectangles would intersect, and hidden timers reserve nothing', () => {
  const base={width:1280,height:720,hostBar:rect(0,0,1280,48),sidebar:rect(970,50,300,660),queueHeight:80};
  assert.equal(safeInsets({...base,timer:rect(980,58,290,54)}).top,60,'timer fully beyond the sidebar boundary');
  assert.equal(safeInsets({...base,timer:rect(600,400,300,54)}).top,60,'timer dragged below the queue');
  assert.equal(safeInsets({...base,timer:rect(600,58,0,0)}).top,60,'hidden or zero-sized timer');
  assert.equal(safeInsets({...base,timer:rect(600,85,300,200)}).top,297,'expanded timer clears with its real height, beyond the generic top cap');
});

test('expanded timer at 1024×768 uses a usable skills drawer over the dock, clear of queue and macros', () => {
  const dockTop=383,dockBottom=658,queueBottom=326;
  assert.equal(skillPopupHeight({dockTop,queueBottom,viewportHeight:768}),37);
  const layout=skillPopupLayout({dockTop,dockBottom,queueBottom,viewportHeight:768});
  assert.deepEqual(layout,{placement:'dock',height:320});
  assert.equal(dockBottom-layout.height,queueBottom+12);
  assert.ok(layout.height>=180);
});
test('skills stay above the dock when the map has room and drawer fallback never reduces available space', () => {
  assert.deepEqual(skillPopupLayout({dockTop:383,dockBottom:658,queueBottom:150,viewportHeight:768}),{placement:'above',height:213});
  assert.deepEqual(skillPopupLayout({dockTop:500,dockBottom:680,queueBottom:120,viewportHeight:768}),{placement:'above',height:322});
  assert.deepEqual(skillPopupLayout({dockTop:160,dockBottom:161,queueBottom:150,viewportHeight:600}),{placement:'above',height:0});
});

test('client scale defaults to 80%, rounds to 5%, and limits invalid or out-of-range values', () => {
  for(const value of [undefined,null,NaN,Infinity,'',{},'bad']) assert.equal(normalizeInterfaceScale(value),80);
  assert.equal(normalizeInterfaceScale(83),85);
  assert.equal(normalizeInterfaceScale('60'),60);
  assert.equal(normalizeInterfaceScale(0),55);
  assert.equal(normalizeInterfaceScale(900),125);
});
test('default panels occupy at most 880 actual pixels, and every supported scale fits the available map width', () => {
  assert.deepEqual(panelSizing({availableWidth:1288}),{percent:80,factor:.8,layoutWidth:1100,actualWidth:880});
  for(const scale of [55,80,100,125]) for(const availableWidth of [630,900,1600]) {
    const size=panelSizing({availableWidth,scale});
    assert.ok(size.layoutWidth<=1100);
    assert.ok(size.actualWidth<=availableWidth+.0001);
    assert.ok(Math.abs(size.actualWidth-size.layoutWidth*size.factor)<.0001);
  }
});
test('a narrower scaled initiative strip does not reserve a nonintersecting timer column', () => {
  const base={width:1672,height:941,hostBar:rect(0,0,1672,48),controls:rect(8,70,42,600),sidebar:rect(1362,50,300,880),queueHeight:64,timer:rect(1052,58,300,54)};
  assert.equal(safeInsets({...base,queueWidth:880}).top,60);
  assert.equal(safeInsets({...base,queueWidth:1288}).top,124);
});

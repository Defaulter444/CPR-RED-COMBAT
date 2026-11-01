import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectedWeapon,safeInsets,cardMaxHeight,normalizeInterfaceScale,panelSizing,scaleFromDrag,hpSegments,chooseDensity,STRIP_DENSITIES,toastAnchors,toastPlacement} from '../scripts/presentation.js';

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
  assert.match(root,/class="[^"]*\bredline-neon\b[^"]*"/);
  assert.match(root,/data-layout="neon-strip"/);
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



test('a narrower scaled initiative strip does not reserve a nonintersecting timer column', () => {
  const base={width:1672,height:941,hostBar:rect(0,0,1672,48),controls:rect(8,70,42,600),sidebar:rect(1362,50,300,880),queueHeight:64,timer:rect(1052,58,300,54)};
  assert.equal(safeInsets({...base,queueWidth:880}).top,60);
  assert.equal(safeInsets({...base,queueWidth:1288}).top,124);
});

test('cards fit between the initiative queue and the strip on the live 1024×768 geometry', () => {
  const stripTop=383,queueBottom=150;
  const height=cardMaxHeight({stripTop,queueBottom,viewportHeight:768});
  assert.equal(height,213);
  assert.equal(stripTop-8-height,queueBottom+12);
});
test('card height respects its wide-screen cap, the viewport share, and a missing gap', () => {
  assert.equal(cardMaxHeight({stripTop:700,queueBottom:150,viewportHeight:1080}),430);
  assert.equal(cardMaxHeight({stripTop:480,queueBottom:150,viewportHeight:720}),310);
  assert.equal(cardMaxHeight({stripTop:160,queueBottom:150,viewportHeight:600}),0);
  assert.equal(cardMaxHeight(),0);
});
test('expanded DEADLINE shortens cards instead of covering the queue', () => {
  const height=cardMaxHeight({stripTop:658,queueBottom:326,viewportHeight:768});
  assert.equal(height,312);
  assert.ok(658-8-height>=326+12);
});
test('client scale defaults to 80%, keeps whole percents, and limits invalid or out-of-range values', () => {
  for(const value of [undefined,null,NaN,Infinity,'',{},'bad']) assert.equal(normalizeInterfaceScale(value),80);
  assert.equal(normalizeInterfaceScale(83),83);
  assert.equal(normalizeInterfaceScale(83.4),83);
  assert.equal(normalizeInterfaceScale('60'),60);
  assert.equal(normalizeInterfaceScale(0),50);
  assert.equal(normalizeInterfaceScale(49.6),50);
  assert.equal(normalizeInterfaceScale(900),150);
});
test('dragging the grip right or up enlarges, left or down shrinks, four pixels per percent', () => {
  assert.equal(scaleFromDrag({startScale:80,dx:40}),90);
  assert.equal(scaleFromDrag({startScale:80,dy:-40}),90);
  assert.equal(scaleFromDrag({startScale:80,dx:-40,dy:40}),60);
  assert.equal(scaleFromDrag({startScale:149,dx:400}),150);
  assert.equal(scaleFromDrag({startScale:'bad',dx:4}),81);
  assert.equal(scaleFromDrag({startScale:80,dx:NaN}),80);
  assert.equal(scaleFromDrag({startScale:80}),80);
});
test('HP segments light ceil(value/max × 10) while alive and none without usable data', () => {
  assert.equal(hpSegments({value:8,max:40}),2);
  assert.equal(hpSegments({value:1,max:40}),1);
  assert.equal(hpSegments({value:40,max:40}),10);
  assert.equal(hpSegments({value:41,max:40}),10);
  assert.equal(hpSegments({value:0,max:40}),0);
  assert.equal(hpSegments({value:-5,max:40}),0);
  for(const hp of [null,undefined,{value:5,max:0},{value:NaN,max:40},{value:5}]) assert.equal(hpSegments(hp),null);
});
test('the default strip occupies at most 800 actual pixels, and every supported scale fits the available map width', () => {
  assert.deepEqual(panelSizing({availableWidth:1288}),{percent:80,factor:.8,layoutWidth:1000,actualWidth:800});
  for(const scale of [50,80,100,150]) for(const availableWidth of [630,900,1600]) {
    const size=panelSizing({availableWidth,scale});
    assert.ok(size.layoutWidth<=1000);
    assert.ok(size.actualWidth<=availableWidth+.0001);
    assert.ok(Math.abs(size.actualWidth-size.layoutWidth*size.factor)<.0001);
  }
});

test('the strip sheds secondary labels only when its full layout does not fit', () => {
  assert.deepEqual(STRIP_DENSITIES,['full','compact','tight']);
  const widths={full:850,compact:720,tight:560};
  const measured=[];
  const measure=density=>{measured.push(density);return widths[density];};
  assert.equal(chooseDensity(measure,1000),'full');
  assert.deepEqual(measured,['full'],'a fitting layout is measured once');
  assert.equal(chooseDensity(measure,850),'full');
  assert.equal(chooseDensity(measure,800),'compact');
  assert.equal(chooseDensity(measure,600),'tight');
  assert.equal(chooseDensity(measure,300),'tight','the tightest layout is the floor');
  assert.equal(chooseDensity(()=>NaN,800),'full','without a strip nothing is hidden');
  assert.equal(chooseDensity(measure,NaN),'full');
});

test('the result pops up over the control that produced it', () => {
  assert.deepEqual(toastAnchors('weapon-attack'),['[data-action="weapon-attack"]']);
  assert.deepEqual(toastAnchors('weapon-damage'),['[data-action="weapon-damage"]']);
  assert.deepEqual(toastAnchors('weapon-reload'),['[data-action="weapon-reload"]','[data-cell="weapon"]']);
  assert.deepEqual(toastAnchors('weapon-load'),['[data-cell="weapon"]']);
  assert.deepEqual(toastAnchors('skill'),['[data-cell="skills"]']);
  for (const kind of ['initiative','death-save']) assert.deepEqual(toastAnchors(kind),['[data-cell="more"]']);
  assert.deepEqual(toastAnchors('unknown'),[]);
  assert.deepEqual(toastAnchors(),[]);
});

test('the result is centred over its control in strip layout pixels and never leaves the free area', () => {
  const box=(left,right)=>({left,right});
  // 80%: a 320px toast is 256px on screen; the attack button's centre is at x=900.
  assert.deepEqual(toastPlacement({anchor:box(870,930),wrap:box(500,1100),bounds:box(232,1300),width:320,factor:.8}),{left:340,width:320});
  // Near the left edge of the free area the toast stops at the edge plus a margin instead of going past it.
  assert.deepEqual(toastPlacement({anchor:box(240,280),wrap:box(232,900),bounds:box(232,1300),width:320,factor:.8}),{left:10,width:320});
  // A strip that starts left of the visible area (bounds already clipped to the viewport) cannot drag the toast with it.
  assert.deepEqual(toastPlacement({anchor:box(10,60),wrap:box(-80,600),bounds:box(0,1280),width:320,factor:1}),{left:88,width:320});
  // Near the right edge it is pulled back inside.
  assert.deepEqual(toastPlacement({anchor:box(1260,1290),wrap:box(700,1300),bounds:box(232,1300),width:320,factor:1}),{left:272,width:320});
  // Without an anchor it sits over the middle of the strip.
  assert.deepEqual(toastPlacement({anchor:null,wrap:box(300,1000),bounds:box(232,1300),width:320,factor:1}),{left:190,width:320});
});

test('in a free area narrower than the toast it shrinks to fit between the margins', () => {
  const box=(left,right)=>({left,right});
  assert.deepEqual(toastPlacement({anchor:box(400,440),wrap:box(232,500),bounds:box(232,500),width:320,factor:1}),{left:8,width:252});
  // At 50% the full 320px toast is only 160px on screen and still fits.
  assert.deepEqual(toastPlacement({anchor:box(400,440),wrap:box(232,500),bounds:box(232,500),width:320,factor:.5}),{left:200,width:320});
  assert.equal(toastPlacement({anchor:null,wrap:null,bounds:box(0,800),width:320,factor:1}),null);
});

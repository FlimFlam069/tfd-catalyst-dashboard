import test from 'node:test';
import assert from 'node:assert/strict';
import {nextSlot,nextCheckin,rewardCurrent,researchHealth,watchdogHealth,catalystSlotView} from './health.mjs';
const now=Date.parse('2026-09-30T20:00:00Z');
test('staggered research slot is :02',()=>assert.equal(nextSlot(now,[2,7,12,17,22,27,32,37,42,47,52,57]).toISOString(),'2026-09-30T20:02:00.000Z'));
test('watchdog slot is :13',()=>assert.equal(nextSlot(now,[13,43]).toISOString(),'2026-09-30T20:13:00.000Z'));
test('rolling cadence follows UTC cron, not prior actual run',()=>assert.equal(nextCheckin(now,{}).toISOString(),'2026-09-30T22:15:00.000Z'));
test('daily safety slot precedes regular slot',()=>assert.equal(nextCheckin(Date.parse('2026-10-01T05:30:00Z'),{}).toISOString(),'2026-10-01T05:55:00.000Z'));
test('previous reward becomes unverified at reset',()=>assert.equal(rewardCurrent({last_verified_claim_at:'2026-09-30T06:59:00Z'},now),false));
test('unknown research is never healthy',()=>assert.equal(researchHealth(null,now)[0],'UNKNOWN'));
test('stale researching does not stay green',()=>assert.equal(researchHealth({status:'researching',checked_at:'2026-09-30T12:00:00Z',next_check_at:'2026-10-01T00:00:00Z'},now)[0],'STALE'));
test('stale watchdog is not standby',()=>assert.equal(watchdogHealth({status:'healthy',checked_at:'2026-09-30T18:00:00Z'},now)[0],'STALE'));
test('requested rescue is not a verified recovery',()=>assert.equal(watchdogHealth({status:'rescue_dispatched',checked_at:'2026-09-30T19:59:00Z'},now)[0],'RECOVERY REQUESTED'));
test('separate catalyst slots show their own countdowns',()=>{
  const base={status:'researching',checked_at:'2026-09-30T19:59:00Z',next_check_at:'2026-09-30T20:10:00Z'};
  const standard=catalystSlotView({...base,estimated_complete_at:'2026-09-30T21:00:00Z'},now);
  const battle=catalystSlotView({...base,estimated_complete_at:'2026-09-30T20:20:00Z'},now);
  assert.equal(standard.countdown,3600);assert.equal(battle.countdown,1200);
});
test('missing battle pass data is shown as waiting',()=>assert.equal(catalystSlotView(null,now).state,'WAITING'));
test('dashboard renders two independent timers', async()=>{
  const instant=Date.parse('2026-09-30T20:00:00Z');
  const iso=minutes=>new Date(instant+minutes*60000).toISOString();
  const slot=minutes=>({status:'researching',checked_at:iso(-1),next_check_at:iso(minutes-3),estimated_complete_at:iso(minutes)});
  const standard=slot(60),battle=slot(20);
  const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',className:'',disabled:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},replaceChildren(){},append(){}});return elements.get(id);};
  let research={...standard,slots:{standard,battle_pass:battle},next_check_at:battle.next_check_at};
  const originals={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch,setInterval:globalThis.setInterval,now:Date.now};
  try {
    globalThis.document={getElementById:element,addEventListener(){},createElement(){return element('link');},hidden:false};
    globalThis.window={addEventListener(){}};
    globalThis.setInterval=()=>0;Date.now=()=>instant;
    globalThis.fetch=async path=>({ok:true,json:async()=>path.startsWith('watchdog-')?{status:'healthy',checked_at:iso(-1)}:
      path.startsWith('checkin-')?{status:'ok',checked_at:iso(-1),last_verified_claim_at:iso(-1)}:
      research});
    await import('./app.mjs?render-test');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(element('countdown').textContent,'01:00:00');
    assert.equal(element('battleCountdown').textContent,'00:20:00');
    assert.equal(element('researchState').textContent,'RESEARCHING');
    assert.equal(element('battleState').textContent,'RESEARCHING');
    research={...research,status:'start_failed'};
    await element('refresh').handlers.click();
    assert.equal(element('nextClaim').textContent,'Live check target: next available run');
  } finally {
    globalThis.document=originals.document;globalThis.window=originals.window;globalThis.fetch=originals.fetch;
    globalThis.setInterval=originals.setInterval;Date.now=originals.now;
  }
});

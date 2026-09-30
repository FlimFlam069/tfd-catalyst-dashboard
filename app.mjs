import {VERSION,time,nextSlot,nextCheckin,rewardCurrent,researchHealth,watchdogHealth} from './health.mjs';
const $ = id => document.getElementById(id);
const repo = 'https://github.com/FlimFlam069/-tfd-companion-automation';
const data = {research:null,watchdog:null,checkin:null};
const failures = new Set(); let loading = false, lastRefresh = null;
const date = v => {const t=time(v); return t === null ? 'Not available' : new Date(t).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});};
const age = v => {const t=time(v); if(t===null)return 'unknown'; const m=Math.max(0,Math.floor((Date.now()-t)/60000));return m<60?`${m} min`:`${Math.floor(m/60)}h ${m%60}m`;};
const duration = s => {s=Math.max(0,Math.floor(s));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':');};
function link(id, d) {
  const e=$(id); e.replaceChildren();
  if (!/^\d+$/.test(String(d?.github_run_id))) return;
  const a=document.createElement('a');a.href=`${repo}/actions/runs/${d.github_run_id}`;a.target='_blank';a.rel='noopener';a.textContent=`Run #${d.github_run_number || d.github_run_id}`;e.append(a);
}
function health(id,meta,tuple) {$(id).textContent=tuple[0];$(id).className=tuple[1];$(meta).textContent=tuple[2];}
function render() {
  const now=Date.now(),r=data.research,w=data.watchdog,c=data.checkin;
  const rh=researchHealth(r,now),wh=watchdogHealth(w,now);
  health('loopHealth','loopMeta',rh); health('watchHealth','watchMeta',wh);
  $('loopMeta').textContent+=r?` Last live sync: ${age(r.checked_at)} ago.`:'';
  $('watchMeta').textContent+=w?` Checked ${age(w.checked_at)} ago.`:'';
  const issues=failures.size>0||['bad','warn'].includes(rh[1])||['bad','warn'].includes(wh[1])||c?.status==='error';
  $('liveFlag').textContent=failures.size?'CACHED ●':issues?'ATTENTION ●':'CURRENT ●';
  $('liveFlag').className=issues?'warn':'live';
  $('researchState').textContent=r?.status==='researching'&&rh[1]!=='bad'?'RESEARCHING':rh[0]; $('researchState').className='state '+rh[1];
  const end=time(r?.estimated_complete_at),due=time(r?.next_check_at);
  $('countdown').textContent=r?.status==='deferred_game_active'?'IN GAME':r?.status==='researching'&&end!==null?(end>now?duration((end-now)/1000):'CHECK DUE'):'—';
  $('completeAt').textContent=r?.status==='researching'&&end!==null?`Estimated completion: ${date(r.estimated_complete_at)}${end<=now?' • awaiting live verification':''}`:r?.detail||'Waiting for status…';
  const tick=nextSlot(now,[2,7,12,17,22,27,32,37,42,47,52,57]),watch=nextSlot(now,[13,43]);
  const slot=d=>`${date(d.toISOString())} • ${duration((d-now)/1000)}`;
  $('nextSync').textContent=`Next cron target: ${slot(tick)}`;
  $('nextWatch').textContent=`Next cron target: ${slot(watch)}`;
  $('nextClaim').textContent=due!==null?`Live check target: ${date(r.next_check_at)}${due<=now?' • overdue/due now':''}`:'Live check target: next available run';
  $('catalystCount').textContent=Number.isFinite(r?.lifetime_claimed_by_automation)?r.lifetime_claimed_by_automation.toLocaleString():'—';
  $('lastCatalystClaimed').textContent=`Last Catalyst claimed: ${date(r?.last_catalyst_claimed_at)}`;
  const current=rewardCurrent(c,now);
  const ca=time(c?.checked_at),stale=ca===null||now-ca>8*3600000||ca>now+60000;
  $('checkinState').textContent=current?(c?.claim_source==='automation'?'✓ CLAIM VERIFIED — AUTOMATION':'✓ REWARD RECEIVED'):c?.status==='error'?'ATTENTION':'AWAITING TODAY’S VERIFICATION';
  $('checkinState').className='state '+(c?.status==='error'?'bad':current&&!stale?'good':'warn');
  $('checkinMeta').textContent=`${stale?'Check-in status is stale. ':''}${current?(c?.claim_source==='automation'?'Automation claim verified.':'Reward already received; who claimed it is unconfirmed.'):(c?.detail||'No reward verification since the latest reset.')} Last check: ${age(c?.checked_at)} ago.`;
  $('checkinVerified').textContent=`Last verified reward: ${date(c?.last_verified_claim_at)}`;
  $('nextCheckin').textContent=`Next check-in cron target: ${slot(nextCheckin(now,c))}`;
  if(stale||!current){$('liveFlag').textContent=failures.size?'CACHED ●':'ATTENTION ●';$('liveFlag').className='warn';}
  link('loopRun',r);link('watchRun',w);link('checkinRun',c);
  $('refreshStatus').textContent=failures.size?`Unable to refresh ${[...failures].join(', ')}. Showing last received data; retrying automatically.`:`Dashboard refreshed ${lastRefresh?date(lastRefresh):'—'} • v${VERSION}`;
}
async function getJson(path) {
  const res=await fetch(`${path}?t=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw Error(`HTTP ${res.status}`);const value=await res.json();
  if(!value||Array.isArray(value)||typeof value!=='object'||time(value.checked_at)===null)throw Error('Invalid status document');return value;
}
async function load() {
  if(loading)return;loading=true;$('refresh').disabled=true;$('refresh').textContent='↻ REFRESHING';
  const entries=[['research','status.json'],['watchdog','watchdog-status.json'],['checkin','checkin-status.json']];
  try {
    const results=await Promise.allSettled(entries.map(([,path])=>getJson(path)));
    results.forEach((r,i)=>{const key=entries[i][0];if(r.status==='fulfilled'){data[key]=r.value;failures.delete(key);}else failures.add(key);});
    lastRefresh=new Date().toISOString();render();
  }finally{loading=false;$('refresh').disabled=false;$('refresh').textContent='↻ REFRESH';}
}
$('refresh').addEventListener('click',load);
window.addEventListener('online',load);window.addEventListener('focus',load);window.addEventListener('pageshow',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
load();setInterval(()=>{if(!document.hidden)render();},1000);setInterval(()=>{if(!document.hidden)load();},60000);

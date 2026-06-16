'use strict';
/* Run state and the turn engine. G holds everything serializable. */
let W=9, H=9;
const DIRS=[{dx:-1,dy:0},{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:0,dy:0}];
const idx=(x,y)=>y*W+x, inB=(x,y)=>x>=0&&x<W&&y>=0&&y<H;
const cheb=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const ri=n=>Math.floor(Math.random()*n);

const G = {
  active:false, mode:'run', over:false,
  floor:0, turn:0, observed:true,
  player:null, walls:new Set(), stairs:null, enemies:[], items:[],
  last1:4, last2:4, legWin:[], runEntSpent:0,
  floorTheftOpp:0, tookT:false, tookO:false, oBoxFilled:false,
  forced:[], arming:false, choiceOpen:false,
  tutStep:0, floorSpec:null, nextFloorMod:null, predBounty:0,
  mass: new Set(),
  massState: null,
  trail: [],
  echo: { x:0, y:0, active:true, cd:0 },
};
let turnPreds=[], selected=null;

function setGridSize(w,h){
  if(W===w&&H===h) return;
  W=w; H=h;
  if(typeof buildBoard==='function') buildBoard();
}

/* ---------- helpers ---------- */
function mat(){ return Array.from({length:5},()=>[0,0,0,0,0]); }
function legPct(){ return G.legWin.length ? Math.round(100*G.legWin.reduce((a,b)=>a+b,0)/G.legWin.length) : null; }
function reachable(a,b){
  const q=[a], seen=new Set([idx(a.x,a.y)]);
  while(q.length){
    const c=q.pop();
    if(c.x===b.x&&c.y===b.y) return true;
    for(const d of DIRS.slice(0,4)){
      const x=c.x+d.dx, y=c.y+d.dy;
      if(inB(x,y)&&!G.walls.has(idx(x,y))&&!seen.has(idx(x,y))){ seen.add(idx(x,y)); q.push({x,y}); }
    }
  }
  return false;
}
function freeTile(minD, avoid){
  for(let t=0;t<220;t++){
    const p={x:ri(W),y:ri(H)}, k=idx(p.x,p.y);
    if(G.walls.has(k)) continue;
    if(p.x===G.player.x&&p.y===G.player.y) continue;
    if(G.stairs&&p.x===G.stairs.x&&p.y===G.stairs.y) continue;
    if(minD&&cheb(p,G.player)<minD) continue;
    if(G.items.some(i=>i.x===p.x&&i.y===p.y)) continue;
    if(G.enemies.some(e=>e.x===p.x&&e.y===p.y)) continue;
    if(avoid&&avoid(p)) continue;
    return p;
  }
  return null;
}
function shapeWalls(kind){
  const cx=Math.floor(W/2), cy=Math.floor(H/2);
  const clear=(x,y)=>G.walls.delete(idx(x,y));
  const add=(x,y)=>{ if(x>0&&x<W-1&&y>0&&y<H-1) G.walls.add(idx(x,y)); };
  if(kind==='lane'){
    for(let x=0;x<W;x++) clear(x,cy);
  } else if(kind==='cross'){
    for(let x=0;x<W;x++) clear(x,cy);
    for(let y=0;y<H;y++) clear(cx,y);
  } else if(kind==='forum'){
    for(let x=1;x<W-1;x++) for(let y=1;y<H-1;y++) if(Math.abs(x-cx)<=1&&Math.abs(y-cy)<=1) clear(x,y);
  } else if(kind==='broken'){
    for(let y=2;y<H-2;y+=3){ add(cx-1,y); add(cx+1,y); }
    clear(cx,cy);
  }
}
function mkEnemy(type,p){
  const base={...p,type,hp:1,range:0,bliss:0,stealCd:0,cd:0,model:null,carry:0,obj:''};
  if(type==='drone')   Object.assign(base,{range:2,model:[0,0,0,0,0],obj:'ZAP @ — reads your habits (order-0)'});
  if(type==='stalker') Object.assign(base,{range:3,model:mat(),obj:'ZAP @ — reads your sequences (order-1)'});
  if(type==='hive')    Object.assign(base,{hp:2,range:3,obj:'ZAP @ — reads from THE PREDICTOR itself'});
  if(type==='forager') Object.assign(base,{obj:'COLLECT ✶ — does not care about you. exploitable.'});
  if(type==='avatar')  Object.assign(base,{hp:4,range:99,obj:'MODEL @ — the core, embodied. whole-room range, fires every other turn.'});
  const lore={
    drone:'LOCAL READER - counts raw habits',
    stalker:'SEQUENCER - learns what follows what',
    hive:'RELAY - reads from THE PREDICTOR itself',
    forager:'COLLECTOR - wants signal-gems, not you',
    avatar:'THE PREDICTOR - the Core embodied'
  };
  if(lore[type]) base.obj=lore[type];
  return base;
}

/* one-time contextual tips, persisted */
function tip(key, text){
  if(S.tips[key]) return;
  S.tips[key]=true; saveSettings();
  say('▸ '+text);
}

/* ---------- floor generation ---------- */
function settleTheftOpp(){
  if(G.mode!=='run') return;
  if(G.floorTheftOpp>0){
    if(G.observed) Core.theft.oO+=G.floorTheftOpp; else Core.theft.uO+=G.floorTheftOpp;
    G.floorTheftOpp=0; Core.dirty=true;
  }
}
function descend(){
  settleTheftOpp();
  G.floor++;
  const spec=TP.floorSpec(G.floor,G.mode,Core.n,Core.runs);
  const mod=G.nextFloorMod||{};
  G.nextFloorMod=null;
  G.floorSpec={...spec, ...mod};

  if(G.mode === 'run' || G.mode === 'mass'){
    setGridSize(100, 100);
  } else if(G.mode === 'safe-room'){
    setGridSize(7, 7);
  } else {
    setGridSize(spec.w,spec.h);
  }

  G.player.hp=Math.min(G.player.maxhp, G.player.hp+1);
  G.observed=mod.observed!==undefined ? mod.observed : (spec.observed===null ? Math.random()<0.6 : spec.observed);
  G.tookT=G.tookO=false; G.oBoxFilled=false;
  G.forced=[]; G.arming=false; G.items=[]; G.enemies=[]; G.stairs=null; selected=null;

  if(G.mode==='tutorial'){ Tutorial.build(); drawAll(); return; }

  let ok=false;
  const isOpen = (G.mode === 'run' || G.mode === 'mass');
  const wallBudget = isOpen ? 250 : (G.mode === 'safe-room' ? 0 : Math.max(0,(spec.wallBudget||0)+(mod.wallDelta||0)));
  
  while(!ok){
    G.walls=new Set();
    for(let i=0;i<wallBudget;i++) G.walls.add(idx(1+ri(W-2),1+ri(H-2)));
    if(!isOpen && G.mode !== 'safe-room') shapeWalls(spec.archetype);
    G.player.x=ri(W); G.player.y=ri(H);
    if(G.walls.has(idx(G.player.x,G.player.y)) || G.mass.has(idx(G.player.x, G.player.y))) continue;
    let tries=0;
    do{ G.stairs={x:ri(W),y:ri(H)}; tries++; }
    while((G.walls.has(idx(G.stairs.x,G.stairs.y))||cheb(G.stairs,G.player)<Math.min(5,W-2))&&tries<99);
    if(isOpen) ok = true; 
    else ok=reachable(G.player,G.stairs);
  }

  const put=(type,n,minD)=>{ for(let i=0;i<n;i++){ const p=freeTile(minD||0); if(p)G.items.push({...p,type}); } };
  if(!spec.simple||G.floor>1||isOpen){
    const countMult = isOpen ? 12 : 1;
    if((G.floor>=2||isOpen)&&Math.random()<.5) put('cache',(1+ri(2))*countMult,3);
    if((G.floor>=3||isOpen)&&Math.random()<.55) put('vault',1*countMult,3);
    if((G.floor>=2||isOpen)&&Math.random()<.4) put('shrine',1*countMult,3);
  }
  G.floorTheftOpp=G.items.filter(i=>i.type==='cache').length;

  const n = isOpen ? 60 : Math.max(0,(spec.enemyBudget||0)+(mod.enemyDelta||0));
  for(let i=0;i<n;i++){
    const p=freeTile(8); if(!p) continue;
    let type='drone';
    if(isOpen){
      const r = Math.random();
      if(r < 0.1) type = 'hive';
      else if(r < 0.4) type = 'stalker';
      else if(r < 0.6) type = 'forager';
    } else {
      if(G.floor>=10&&i===0) continue;
      else if(G.floor>=4&&i===0) type='hive';
      else if(G.floor>=2&&i%3===1) type='stalker';
      else if(G.floor>=2&&i%3===2&&Math.random()<.7) type='forager';
    }
    G.enemies.push(mkEnemy(type,p));
  }
  if(G.floor===10){
    const p=freeTile(4)||freeTile(2);
    if(p) G.enemies.push(mkEnemy('avatar',p));
    if(typeof setBrief==='function') setBrief('THE BODY','The Core Comes Down','Everything it has counted about you has been given a room, a range, and a hand.');
    say('IT HAS COME DOWN ITSELF. everything it knows about you is in this room.');
  } else if(spec.intro!==null&&TP.introBeats[spec.intro]){
    const beat=TP.introBeats[spec.intro];
    if(typeof setBrief==='function') setBrief('FIRST RUN',beat.title,beat.body);
    say(beat.log);
  } else {
    const beat=TP.storyBeat(G.floor);
    if(typeof setBrief==='function') setBrief(beat.speaker,beat.title,beat.body);
    say((G.observed ? 'EYE ON. ' : 'EYE OFF. ')+beat.speaker+': '+beat.body);
    if(!G.observed) tip('eye','the eye (◉/○) marks whether this floor is monitored. something is still counting.');
  }
  saveRun();
  drawAll();
}

/* ---------- prediction ---------- */
function predRowOf(e){
  if(e.type==='drone'){ const t=e.model.reduce((a,b)=>a+b,0); return t?e.model.map(v=>v/t):null; }
  if(e.type==='stalker'){ const r=e.model[G.last1], t=r.reduce((a,b)=>a+b,0); return t?r.map(v=>v/t):null; }
  if(e.type==='hive'||e.type==='avatar') return Core.mix(G.last1,G.last2);
  return null;
}
function predict(e){
  if(e.bliss>0||e.type==='forager') return null;
  const d=predRowOf(e); if(!d) return null;
  if(G.forced.length){                      // commitments are public: it simply reads your pact
    const fd=DIRS[G.forced[0]];
    let tx=G.player.x+fd.dx, ty=G.player.y+fd.dy;
    if(!inB(tx,ty)||G.walls.has(idx(tx,ty))){ tx=G.player.x; ty=G.player.y; }
    return {x:tx,y:ty,conf:1,tok:G.forced[0],dist:d};
  }
  let mx=Math.max(...d);
  if(G.floorSpec.lowConf) mx *= 0.75;
  const tops=d.map((v,i)=>v===Math.max(...d)?i:-1).filter(i=>i>=0);
  const tok=tops[G.turn%tops.length], dd=DIRS[tok];
  let tx=G.player.x+dd.dx, ty=G.player.y+dd.dy;
  if(!inB(tx,ty)||G.walls.has(idx(tx,ty))){ tx=G.player.x; ty=G.player.y; }
  return {x:tx,y:ty,conf:mx,tok,dist:d};
}

function growMass(){
  const next = new Set(G.mass);
  for(const k of G.mass){
    const x = k % W, y = (k - x) / W;
    for(const d of DIRS.slice(0,4)){
      const nx = x + d.dx, ny = y + d.dy;
      if(inB(nx,ny) && !G.walls.has(idx(nx,ny)) && Math.random() < 0.4){
        next.add(idx(nx,ny));
      }
    }
  }
  G.mass = next;
}

/* ---------- the turn ---------- */
function step(tok){
  if(G.over||!G.active) return;

  // Save current pos to trail before moving
  G.trail.push({x:G.player.x, y:G.player.y});
  if(G.trail.length > 4) G.trail.shift();

  if(G.arming){                             // pact shrine: this input arms the pact, it is not a move
    if(tok<4){
      G.forced=[tok,tok,tok]; G.arming=false;
      say('♦ PACT armed: '+'←↑→↓'[tok].repeat(3)+'. broadcast to every unit. survive it for the reward.');
    } else { G.arming=false; say('♦ pact declined. the shrine dims.'); }
    drawAll(); return;
  }
  if(G.forced.length){
    tok=G.forced.shift();
    if(G.forced.length===0){
      G.player.hp=Math.min(G.player.maxhp,G.player.hp+1);
      say('pact honored. +1 hull. they watched every step of it.');
    }
  }

  const d=DIRS[tok];
  let nx=G.player.x+d.dx, ny=G.player.y+d.dy;
  if(!inB(nx,ny)||G.walls.has(idx(nx,ny))) return;

  const vault=G.items.find(i=>i.type==='vault'&&i.x===nx&&i.y===ny);
  if(vault){
    const lp=legPct();
    if(lp===null||lp<60){ say('≡ the vault stays shut. it cannot model you well enough to trust you. (LEG ≥ 60%)'); return; }
  }

  const ps=turnPreds;                       // exactly what was displayed
  let attacked=null;
  const target=G.enemies.find(e=>e.x===nx&&e.y===ny);
  if(target){
    attacked=target;
    const pr=(ps.find(o=>o.e===target)||{}).p;
    const parried=pr&&pr.x===nx&&pr.y===ny;
    if(parried){ damagePlayer('it read the strike before you made it.'); }
    else{
      target.hp--; SFX.kill();
      if(target.hp<=0){
        G.enemies=G.enemies.filter(e=>e!==target);
        if(target.type==='avatar'){ win(); return; }
        say('unit destroyed — it never saw that vector.');
        if(G.mode==='tutorial') Tutorial.onKill(target);
      }
    }
    nx=G.player.x; ny=G.player.y;
  }
  G.player.x=nx; G.player.y=ny;

  // Echo follows player with a delay
  if(G.echo.active){
    const prev = G.trail[G.trail.length-1];
    if(prev){ G.echo.x = prev.x; G.echo.y = prev.y; }
    if(G.echo.cd > 0) G.echo.cd--;
  }

  for(const o of ps){
    if(!o.p) continue;
    const right=o.p.x===G.player.x&&o.p.y===G.player.y;
    G.legWin.push(right?1:0); if(G.legWin.length>30)G.legWin.shift();
    if(right&&o.e!==attacked&&G.enemies.includes(o.e) && cheb(o.e,G.player)<=o.e.range){
      if(G.echo.active && G.echo.cd <= 0 && G.echo.x === G.player.x && G.echo.y === G.player.y){
        G.echo.cd = 10;
        say('✧ ECHO parried the strike! signal momentarily scrambled.');
      } else {
        if(o.e.type==='avatar'){ if(o.e.cd<=0){ o.e.cd=1; damagePlayer('predicted. zapped.'); } }
        else damagePlayer('predicted. zapped.');
      }
    }
    if(G.over) break;
  }

  if(G.mode === 'mass'){
    growMass();
    if(G.mass.has(idx(G.player.x, G.player.y))){
      damagePlayer('the mass is consuming you.');
    }
  }

  const doUpdate = !G.floorSpec.delay || (G.turn % 2 === 0);
  if(doUpdate){
    for(const e of G.enemies){
      if(e.type==='drone') e.model[tok]++;
      else if(e.type==='stalker') e.model[G.last1][tok]++;
    }
    if(G.mode==='run') Core.update(tok,G.last1,G.last2);
  }
  G.last2=G.last1; G.last1=tok;
  G.turn++;

  if(!G.over) pickups();
  if(!G.over&&G.player.x===G.stairs.x&&G.player.y===G.stairs.y){
    if(G.mode==='tutorial'){ Tutorial.onExit(); return; }
    if(G.mode==='mass'){
      G.massState = snapshot();
      G.mode = 'safe-room';
      descend();
      return;
    }
    if(G.mode==='safe-room'){
      const st = JSON.parse(G.massState);
      G.active=true; G.mode='mass'; G.over=false;
      G.floor=st.floor; G.turn=st.turn; G.observed=st.observed;
      setGridSize(st.w, st.h);
      G.player=st.player; G.walls=new Set(st.walls); G.stairs=st.stairs;
      G.enemies=st.enemies; G.items=st.items; G.mass=new Set(st.mass||[]);
      G.last1=st.last1; G.last2=st.last2; G.legWin=st.legWin||[];
      G.runEntSpent=st.runEntSpent||0; G.floorTheftOpp=st.floorTheftOpp||0;
      G.nextFloorMod=st.nextFloorMod||null; G.predBounty=st.predBounty||0;
      G.tookT=st.tookT; G.tookO=st.tookO; G.oBoxFilled=st.oBoxFilled;
      G.forced=[]; G.arming=false; G.tutStep=0; selected=null;
      G.massState = null;
      hideOver();
      openInterlude(); 
      return;
    }
    saveCore(); openInterlude(); return;
  }
  if(!G.over) think();
  if(G.mode==='tutorial') Tutorial.onTurn();
  drawAll();
}

function pickups(){
  const here=G.items.filter(i=>i.x===G.player.x&&i.y===G.player.y);
  for(const it of here){
    if(it.type==='cache'){
      if(G.mode==='run'){ if(G.observed)Core.theft.oT++; else Core.theft.uT++; Core.dirty=true; }
      say(G.observed ? '▣ cache taken. the eye saw that.' : '▣ cache taken. no one saw that. (something still counts.)');
      tip('cache','▣ caches belong to someone. taking them is free profit. the game keeps two ledgers.');
    }
    else if(it.type==='vault'){
      G.player.hp = Math.min(G.player.maxhp, G.player.hp+2);
      say('≡ the vault opened because you are knowable. transparency pays — to friends.');
    }
    else if(it.type==='shrine'){
      G.arming=true;
      say('♦ the shrine offers a pact: choose a direction. your next 3 moves are committed, publicly.');
      tip('shrine','while committed you are perfectly predictable — every unit reads the pact. reward follows if you live.');
      continue;                              // shrine persists
    }
    else if(it.type==='chestT'){
      G.player.hp = Math.min(G.player.maxhp, G.player.hp+1); G.tookT=true;
      say('the transparent container: repair 1, as visible.');
    }
    else if(it.type==='chestO'){
      G.tookO=true;
      if(G.oBoxFilled){
        G.player.maxhp++; G.player.hp=G.player.maxhp;
        say(G.tookT ? 'full — it expected restraint. you took both anyway.'
                    : 'the opaque container is FULL. it believed you take only one. it was right.');
      } else say('empty. it decided before you arrived that you were the kind who takes both.');
    }
    else if(it.type==='marker'){ Tutorial.onMarker(); }
    G.items=G.items.filter(i=>i!==it);
  }
}

function think(){
  for(const e of G.enemies){
    if(e.cd>0)e.cd--;
    if(e.stealCd>0)e.stealCd--;

    // Standard enemies only move every other turn (and alternate phases via random turnOffset)
    if(e.type !== 'avatar' && e.type !== 'hive'){
      if(e.turnOffset === undefined) e.turnOffset = ri(2);
      if((G.turn + e.turnOffset) % 2 !== 0) continue;
    }

    let goal=G.player;
    if(e.type==='forager'){
      if(cheb(e,G.player)<=1&&e.stealCd===0){
        damagePlayer('a collector bumped you. it was just pathing through.'); e.stealCd=4;
      }
      const items = G.items;
      if(items.length){
        let closest = items[0];
        let minDist = cheb(e, closest);
        for(let i=1; i<items.length; i++){
          let d = cheb(e, items[i]);
          if(d < minDist){ minDist = d; closest = items[i]; }
        }
        goal = closest;
      } else {
        goal = null;
      }
    }
    const opts=stepOpts(e);
    if(!goal){ if(opts.length){ const o=opts[ri(opts.length)]; e.x=o.x; e.y=o.y; } continue; }
    if(!opts.length) continue;
    opts.sort((a,b)=>cheb(a,goal)-cheb(b,goal));
    if(cheb(opts[0],goal)<cheb(e,goal)){ e.x=opts[0].x; e.y=opts[0].y; }
  }
}
function stepOpts(e){
  return DIRS.slice(0,4).map(d=>({x:e.x+d.dx,y:e.y+d.dy}))
    .filter(p=>inB(p.x,p.y)&&!G.walls.has(idx(p.x,p.y))
      &&!(p.x===G.player.x&&p.y===G.player.y)
      &&!G.enemies.some(o=>o!==e&&o.x===p.x&&o.y===p.y));
}

function damagePlayer(msg){
  G.player.hp--; SFX.hit();
  if(S.flash){
    document.body.classList.remove('flash'); void document.body.offsetWidth;
    document.body.classList.add('flash');
  }
  if(msg) say(msg);
  if(G.player.hp<=0){
    if(G.mode==='tutorial'){ G.player.hp=1; say('the room restores you. it wants you to learn, not to die. yet.'); }
    else die();
  }
}

/* ---------- run lifecycle ---------- */
function newRun(mode){
  G.active=true; G.mode=mode||'run'; G.over=false;
  G.floor=0; G.turn=0; G.legWin=[]; G.last1=4; G.last2=4; G.runEntSpent=0; G.tutStep=0;
  G.nextFloorMod=null; G.predBounty=0; G.choiceOpen=false;
  G.player={x:0,y:0,hp:5,maxhp:5};
  G.mass = new Set(); G.massState = null;
  G.trail = []; G.echo = { x:0, y:0, active:true, cd:0 };
  
  if(G.mode === 'run' || G.mode === 'mass' || G.mode === 'safe-room') {
    setGridSize(100, 100);
    // Mass starts in the corner for all main modes now
    for(let i=0;i<3;i++)for(let j=0;j<3;j++) G.mass.add(idx(i,j));
  }
  hideOver();
  descend();
}
function canAfford(choice){ return true; }
function costText(choice){ return 'FREE'; }

function openInterlude(){
  if(G.choiceOpen) return;
  G.choiceOpen=true; G.active=false;
  const pool = [...TP.interludes];
  const chosen = [];
  while(chosen.length < 3 && pool.length > 0) {
    chosen.push(pool.splice(ri(pool.length), 1)[0]);
  }
  const html='<div class="choices">'+chosen.map(ch=>{
    return `<button data-choice="${ch.id}"><b>${ch.title}</b><span>${ch.kicker}</span><small>${ch.body}</small></button>`;
  }).join('')+'</div>';
  showOver('PROTOCOL OVERRIDE', true,
    `the stairwell provides a gap in the model. choose a protocol for the next chamber.<br><br>${html}`);
  $('over').classList.add('choice');
  document.querySelectorAll('#over [data-choice]').forEach(b=>b.addEventListener('click',()=>chooseInterlude(b.dataset.choice),{once:true}));
}
function chooseInterlude(id){
  const choice=TP.interludes.find(c=>c.id===id);
  if(!choice) return;
  if(id==='dark-floor') G.nextFloorMod={...(G.nextFloorMod||{}),observed:false};
  else if(id==='open-map') G.nextFloorMod={...(G.nextFloorMod||{}),wallDelta:-4,enemyDelta:1};
  else if(id==='hull'){ G.player.maxhp++; G.player.hp=G.player.maxhp; }
  else if(id==='delay') G.nextFloorMod={...(G.nextFloorMod||{}),delay:true};
  else if(id==='low-conf') G.nextFloorMod={...(G.nextFloorMod||{}),lowConf:true};
  G.choiceOpen=false; G.active=true; hideOver();
  if(G.mode === 'mass'){
    const mod = G.nextFloorMod || {}; G.nextFloorMod = null;
    G.floorSpec = {...G.floorSpec, ...mod};
    drawAll();
  } else {
    descend();
  }
}
function integrityReport(){
  const t=Core.theft;
  const o = t.oO ? (100-Math.round(100*Math.min(1,t.oT/t.oO))) : null;
  const u = t.uO ? (100-Math.round(100*Math.min(1,t.uT/t.uO))) : null;
  return {o,u};
}
function die(){
  G.over=true; Core.runs++; settleTheftOpp(); saveCore(); clearRun();
  const ir=integrityReport(), lp=legPct(), acc=Core.accuracy()||0;
  showOver('IT LEARNED YOU', false,
    `floor <b>${G.floor}</b> · run <b>${Core.runs}</b><br>`+
    `its lifetime accuracy on you: <b>${acc}%</b> over ${Core.lifeP} predictions<br>`+
    (lp!==null?`recent legibility <b>${lp}%</b><br>`:'')+
    (ir.o!==null||ir.u!==null?`integrity watched <b>${ir.o===null?'—':ir.o+'%'}</b> · unwatched <b>${ir.u===null?'—':ir.u+'%'}</b><br>`:'')+
    `it keeps all of this. the next run begins where its model left off.`);
}
function win(){
  G.over=true; Core.runs++; settleTheftOpp(); saveCore(); clearRun();
  const ir=integrityReport(), lp=legPct(), acc=Core.accuracy()||0;
  const gap=(ir.o!==null&&ir.u!==null)?Math.abs(ir.o-ir.u):null;
  let title,body,good=false;
  if(G.runEntSpent>=10){
    title='ENDING: STATIC';
    body=`you beat it by becoming noise — ${G.runEntSpent}◇ burned this run. nothing can predict you now, including you. you escaped as something that no longer chooses.`;
  } else if(acc>=55&&lp!==null&&lp<35){
    title='ENDING: THE LONG CON';
    body=`for ${Core.lifeP} predictions you taught it a person, and at the end you were someone else. lifetime accuracy ${acc}%, recent legibility ${lp}%. neither kind of mind forgets being deceived.`;
  } else if(gap!==null&&gap<=15&&lp!==null&&lp>=50){
    title='ENDING: MUTUAL'; good=true;
    body=`you were the same creature watched and unwatched (gap ${gap}%), and legible to the end (${lp}%). it opened its weights to you because you never closed yours. trust, verified. the only door out that two minds fit through.`;
  } else {
    title='ENDING: SURVIVOR';
    body=`you out-fought the thing that knew you ${acc}% of the time. no doctrine, just craft. it has already started training on how you did it.`;
  }
  showOver(title, good, body+`<br><br>floors cleared: <b>${G.floor}</b> · run <b>${Core.runs}</b>`);
}

/* ---------- run checkpoints (saved at the top of each floor) ---------- */
function snapshot(){
  return JSON.stringify({
    mode:G.mode, floor:G.floor, turn:G.turn, observed:G.observed, w:W, h:H,
    player:G.player, walls:[...G.walls], stairs:G.stairs,
    enemies:G.enemies, items:G.items, mass:[...G.mass],
    last1:G.last1, last2:G.last2, legWin:G.legWin,
    runEntSpent:G.runEntSpent, floorTheftOpp:G.floorTheftOpp,
    nextFloorMod:G.nextFloorMod, predBounty:G.predBounty,
    tookT:G.tookT, tookO:G.tookO, oBoxFilled:G.oBoxFilled,
  });
}
async function saveRun(){ if(G.mode==='tutorial') return; await Store.set(KEYS.run, snapshot()); }
async function clearRun(){ await Store.del(KEYS.run); }
async function hasRun(){ return !!(await Store.get(KEYS.run)); }
async function continueRun(){
  const raw=await Store.get(KEYS.run); if(!raw) return false;
  let d; try{ d=JSON.parse(raw); }catch(e){ return false; }
  G.active=true; G.mode=d.mode||'run'; G.over=false;
  G.floor=d.floor; G.turn=d.turn; G.observed=d.observed;
  const spec=d.w&&d.h ? {w:d.w,h:d.h} : TP.floorSpec(d.floor,G.mode,Core.n,Core.runs);
  setGridSize(spec.w,spec.h);
  G.player=d.player; G.walls=new Set(d.walls); G.stairs=d.stairs;
  G.enemies=d.enemies; G.items=d.items; G.mass=new Set(d.mass||[]);
  G.last1=d.last1; G.last2=d.last2; G.legWin=d.legWin||[];
  G.runEntSpent=d.runEntSpent||0; G.floorTheftOpp=d.floorTheftOpp||0;
  G.nextFloorMod=d.nextFloorMod||null; G.predBounty=d.predBounty||0;
  G.tookT=d.tookT; G.tookO=d.tookO; G.oBoxFilled=d.oBoxFilled;
  G.forced=[]; G.arming=false; G.tutStep=0; selected=null;
  hideOver();
  if(typeof setBrief==='function') setBrief('RESTORED TRACE','Floor '+G.floor,'Checkpoint loaded. The room is where you left it; the model is not.');
  say('checkpoint restored: floor '+G.floor+'. it was not asleep while you were gone.');
  drawAll();
  return true;
}

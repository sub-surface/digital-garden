'use strict';
/* Rendering: the chamber, the stains, the instruments. */
let cells=[], msgOld='';
const $=id=>document.getElementById(id);

const ITEMG={gem:['✶','gemc'],ent:['◇','entc'],blissPick:['ψ','blc'],cache:['▣','cachec'],
  vault:['≡','gatec'],shrine:['♦','shrc'],trap:['ψ','blc'],chestT:['◻','gemc'],chestO:['◼','entc'],
  marker:['✦','gatec']};

if(typeof TP!=='undefined'&&TP.glyph&&TP.glyph.item) Object.assign(ITEMG, TP.glyph.item);

const VW=25, VH=25;
let newsIdx = 0, lastNews = 0, particles = [];

function buildBoard(){
  const board=$('board');
  board.replaceChildren();
  cells=[];
  board.style.setProperty('grid-template-columns',`repeat(${VW},var(--cs))`);
  resizeBoard();
  for(let i=0;i<VW*VH;i++){
    const c=document.createElement('div'); c.className='cell'; c.dataset.i=i;
    
    const stain=document.createElement('div'); stain.className='stain';
    const glyph=document.createElement('span'); glyph.className='glyph';
    const hpdots=document.createElement('div'); hpdots.className='hpdots';
    
    c.appendChild(stain);
    c.appendChild(glyph);
    c.appendChild(hpdots);
    
    board.appendChild(c);
    cells.push({
      el: c,
      stain: stain,
      glyph: glyph,
      hpdots: hpdots
    });
  }

  // Create canvas particle layer
  if(!$('particles')){
    const p = document.createElement('canvas'); p.id = 'particles';
    p.style.position = 'absolute'; p.style.inset = '0'; p.style.pointerEvents = 'none'; p.style.zIndex = '5';
    $('stage').appendChild(p);
  }

  requestAnimationFrame(tick);
}

function resizeBoard(){
  const cs = Math.max(24, Math.min(Math.floor(innerWidth/VW), Math.floor(innerHeight/VH)));
  document.documentElement.style.setProperty('--cs',cs+'px');
}

function say(t){
  msgOld=$('logNew').textContent;
  $('logNew').textContent=t;
  $('logOld').textContent=msgOld;
}

function setBrief(kicker,title,body){
  $('briefKicker').textContent=kicker;
  $('briefTitle').textContent=title;
  $('briefBody').textContent=body;
}

function showOver(title,good,html){
  $('overTitle').textContent=title;
  $('overTitle').className=good?'good':'';
  $('overStats').innerHTML=html;
  $('over').classList.add('show');
}
function hideOver(){ $('over').classList.remove('show','choice'); }

function drawAll(){
  // Sort active predictive enemies by Chebyshev proximity
  const activePredictors = G.enemies
    .filter(e => e.type !== 'forager' && e.bliss <= 0)
    .map(e => ({ e, dist: cheb(e, G.player) }))
    .sort((a, b) => a.dist - b.dist);

  const allowedPredictors = activePredictors.slice(0, 2).map(o => o.e);

  const ps = G.enemies.map(e => {
    if (!allowedPredictors.includes(e)) return { e, p: null };
    return { e, p: predict(e) };
  });
  turnPreds = ps;
  let best=null;
  for(const o of ps) if(o.p&&(!best||o.p.conf>best.p.conf)) best=o;

  const camX = Math.max(0, Math.min(W - VW, G.player.x - Math.floor(VW / 2)));
  const camY = Math.max(0, Math.min(H - VH, G.player.y - Math.floor(VH / 2)));

  for(let vy=0;vy<VH;vy++)for(let vx=0;vx<VW;vx++){
    const x = camX + vx, y = camY + vy;
    const cellObj = cells[vy*VW+vx];
    const c = cellObj.el;
    const g = cellObj.glyph;
    const s = cellObj.stain;
    const hd = cellObj.hpdots;

    c.className='cell';
    g.className='glyph';
    g.textContent='';
    g.style.opacity = 1;
    g.style.transform = '';
    s.style.opacity=0;
    hd.textContent='';

    if(!inB(x,y)){ c.classList.add('wall'); continue; }
    if(G.walls.has(idx(x,y))){ c.classList.add('wall'); continue; }
    if(G.mass.has(idx(x,y))){ c.classList.add('mass'); g.textContent='~'; }
    if(G.stairs&&x===G.stairs.x&&y===G.stairs.y){ g.textContent='>'; g.classList.add('exit'); }

    const it=G.items.find(i=>i.x===x&&i.y===y);
    if(it){ const[ch,cl]=ITEMG[it.type]; g.textContent=ch; g.classList.add(cl); }

    const e=G.enemies.find(e=>e.x===x&&e.y===y);
    if(e){
      g.textContent=e.type==='avatar'?'Ω':e.type==='hive'?'H':e.type==='stalker'?'S':e.type==='forager'?'f':'d';
      g.classList.add('foe'); if(e.type==='avatar')g.classList.add('big');
      if(e.bliss>0)g.classList.add('blissed');
      if(e.hp>1){ hd.textContent='•'.repeat(e.hp); }
      if(e===selected)c.classList.add('sel');
      const info=TP.glyph.enemy[e.type];
      if(info){ g.textContent=info.char; g.classList.add(info.cls); c.title=info.name; }
    }

    if(x===G.player.x&&y===G.player.y){ 
      g.textContent=(TP.glyph.player&&TP.glyph.player.char)||'@'; 
      g.className='glyph you'; 
      c.title=(TP.glyph.player&&TP.glyph.player.name)||'you'; 
    }

    // Habit Trail
    const trailIdx = G.trail.findIndex(p=>p.x===x&&p.y===y);
    if(trailIdx >= 0 && !(x===G.player.x&&y===G.player.y)){
      g.textContent = (TP.glyph.player&&TP.glyph.player.char)||'@';
      g.className = 'glyph ghost';
      g.style.opacity = 0.1 + (trailIdx * 0.05);
    }

    // Echo Drone
    if(G.echo.active && x===G.echo.x && y===G.echo.y && !(x===G.player.x&&y===G.player.y)){
      g.textContent = '✧';
      g.className = 'glyph echo';
      if(G.echo.cd > 0) g.style.opacity = 0.4;
    }

    let stain=0;
    for(const o of ps) if(o.p&&o.p.x===x&&o.p.y===y) stain=Math.max(stain,.14+.42*o.p.conf);
    if(stain)s.style.opacity=stain;
    if(best&&best.p.x===x&&best.p.y===y)c.classList.add('locked');
  }

  /* HUD */
  $('hFloor').textContent=G.floor;
  $('hHp').textContent='▮'.repeat(Math.max(0,G.player.hp))+'▯'.repeat(Math.max(0,G.player.maxhp-G.player.hp));
  const lp=legPct(); $('hLeg').textContent=lp===null?'—':lp+'%';
  $('hEye').textContent=G.observed?'◉':'○';
  $('hEyeWrap').style.opacity=G.observed?1:.45;

  /* dossier panel */
  let dos = `<b>ACTIVE PROTOCOLS:</b><br>`;
  const mods = G.floorSpec || {};
  let anyMod = false;
  if(mods.delay) { dos += `· LAG: delayed modeling<br>`; anyMod=true; }
  if(mods.lowConf) { dos += `· DITHER: reduced confidence<br>`; anyMod=true; }
  if(!anyMod) dos += `· standard trace parameters<br>`;

  if(G.mass && G.mass.size > 0){
    const pct = Math.round(100 * G.mass.size / (W*H));
    dos += `<br><b>THE MASS:</b><br>`;
    dos += `· CONSUMPTION: ${pct}%<br>`;
    dos += `· VECTOR: expanding<br>`;
  }

  let show=selected&&G.enemies.includes(selected)?selected:null;
  if(show){
    const bios = {
      drone: 'Standard surveillance unit. It counts your turns and expects consistency. "It does not hate, it only totals."',
      stalker: 'Advanced sequence reader. It looks at what you did *before* your last move. "Memory is a weapon."',
      hive: 'A direct uplink to the persistent Core. It uses every run you have ever finished against you.',
      forager: 'A resource-gathering automaton. It is indifferent to your presence, which makes it dangerous.',
      avatar: 'The physical manifestation of the Predictor. Every weight and bias given a hand and a zap range.',
    };
    dos += `<br><b>UNIT CASE FILE:</b><br>`;
    dos += `· TYPE: ${show.type.toUpperCase()}<br>`;
    dos += `· INTENT: ${bios[show.type] || 'Unknown'}<br>`;
  }

  dos += `<br><b>CORE STATUS:</b><br>`;
  dos += `· witness: run ${Core.runs+1}<br>`;
  dos += `· lifetime accuracy: ${Core.accuracy()===null?'—':Core.accuracy()+'%'}<br>`;
  dos += `· training set: ${Math.round(Core.n)} examples<br>`;
  $('dossierContent').innerHTML = dos;

  /* minimap */
  drawMinimap();

  /* model panel: selected, else nearest predictive unit */
  if(!show){ for(const e of G.enemies) if(e.type!=='forager'&&(!show||cheb(e,G.player)<cheb(show,G.player))) show=e; }
  if(!show&&G.enemies.length) show=G.enemies[0];
  const fills=document.querySelectorAll('#bars .fill'), barEls=document.querySelectorAll('#bars .bar');
  if(show){
    const names={drone:'DRONE',stalker:'STALKER',hive:'HIVE (core-linked)',forager:'FORAGER',avatar:'Ω THE PREDICTOR'};
    $('modelWho').textContent=names[show.type]+(show.bliss>0?' — blissed':'');
    $('objline').innerHTML='objective: <b>'+show.obj+'</b>'+(show.range?' · zap range '+(show.range>10?'∞':show.range):'');
    const d=predRowOf(show);
    if(d){ const mx=Math.max(...d);
      d.forEach((v,i)=>{ fills[i].style.height=Math.round(100*v)+'%'; barEls[i].classList.toggle('top',v===mx&&mx>0); }); }
    else{ fills.forEach(f=>f.style.height='0%'); barEls.forEach(b=>b.classList.remove('top')); }
  } else {
    $('modelWho').textContent='no signal';
    $('objline').textContent='nothing here is modeling you. enjoy it.';
    fills.forEach(f=>f.style.height='0%'); barEls.forEach(b=>b.classList.remove('top'));
  }

  /* notifications */
  updateNotifications();

  /* pre-echo: when it is confident and you are legible, the score plays your move before you do */
  if(best&&best.p.conf>.55&&lp!==null&&lp>55)SFX.echo(best.p.tok);
}

function drawMinimap(){
  const canvas = $('mmap'), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0b0a'; ctx.fillRect(0,0,100,100);

  // Walls
  ctx.fillStyle = '#363635';
  for(const k of G.walls){ const x = k % W, y = (k - x) / W; ctx.fillRect(x,y,1,1); }

  // Mass
  ctx.fillStyle = '#d95a52';
  for(const k of G.mass){ const x = k % W, y = (k - x) / W; ctx.fillRect(x,y,1,1); }

  // Enemies
  ctx.fillStyle = '#f06a6f';
  for(const e of G.enemies) ctx.fillRect(e.x, e.y, 1, 1);

  // Player
  ctx.fillStyle = '#54c7d3';
  ctx.fillRect(G.player.x, G.player.y, 2, 2);
}

function updateNotifications(){
  const area = $('notif-area');
  let html = '';
  if(G.echo.active) html += `<div class="notif"><b>ECHO:</b> online. parry ${G.echo.cd > 0 ? 'recharging ('+G.echo.cd+')' : 'READY'}</div>`;
  if(G.mode === 'mass') html += `<div class="notif"><b>SURVIVAL:</b> the mass is ${Math.round(100 * G.mass.size / (W*H))}% world-dense</div>`;
  if(G.floorSpec.delay) html += `<div class="notif"><b>SIGNAL:</b> lag protocol active</div>`;
  if(G.floorSpec.lowConf) html += `<div class="notif"><b>SIGNAL:</b> dither protocol active</div>`;
  area.innerHTML = html;
}

function tick(t){
  if(!G.active || G.over) return requestAnimationFrame(tick);

  // News Ticker Permuter
  if(t - lastNews > 8000){
    newsIdx = (newsIdx + 1) % TP.newsTicker.length;
    if($('news-ticker')) $('news-ticker').textContent = TP.newsTicker[newsIdx];
    lastNews = t;
  }

  // Drifting Particles (Canvas implementation)
  const canvas = $('particles');
  if(canvas){
    const ctx = canvas.getContext('2d');
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if(canvas.width !== w || canvas.height !== h){
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0,0,w,h);

    if(Math.random() < 0.08 && particles.length < 30){
      particles.push({
        char: ri(2) ? '0' : '1',
        xPercent: ri(100),
        yPercent: 105,
        vel: 0.05 + Math.random()*0.15
      });
    }

    ctx.fillStyle = 'rgba(91, 90, 86, 0.3)'; // var(--line-strong) with 0.3 opacity
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';

    for(let i = particles.length - 1; i >= 0; i--){
      const p = particles[i];
      p.yPercent -= p.vel;
      if(p.yPercent < -10){
        particles.splice(i, 1);
        continue;
      }
      const px = (p.xPercent / 100) * w;
      const py = (p.yPercent / 100) * h;
      ctx.fillText(p.char, px, py);
    }
  }

  requestAnimationFrame(tick);
}

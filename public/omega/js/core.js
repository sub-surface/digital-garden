'use strict';
/* THE PREDICTOR — persistent context-mixing core.
   Mixes order-0/1/2 frequency models of the player's action stream,
   weighted by each order's self-scored accuracy. Survives death; saves
   between sessions. Hive units and the Avatar read from it directly.    */
const Core = {
  c0: new Array(5).fill(0),
  c1: Array.from({length:5},  () => new Array(5).fill(0)),
  c2: Array.from({length:25}, () => new Array(5).fill(0)),
  acc: [ {p:0,h:0},{p:0,h:0},{p:0,h:0} ],
  n:0, runs:0, lifeP:0, lifeH:0,
  warden: [],                                // 'one' | 'two' history
  theft: { oT:0, oO:0, uT:0, uO:0 },         // observed/unobserved thefts & opportunities
  ent:0,                                     // lifetime entropy spent against it
  dirty:false,

  dist(o, last1, last2){
    const row = o===0 ? this.c0 : o===1 ? this.c1[last1] : this.c2[last2*5+last1];
    const t = row.reduce((a,b)=>a+b,0);
    return t>0 ? row.map(v=>v/t) : null;
  },
  mix(last1, last2){
    const out = new Array(5).fill(0); let wsum = 0;
    for(let o=0;o<3;o++){
      const d = this.dist(o,last1,last2); if(!d) continue;
      const a = this.acc[o], w = (a.h+1)/(a.p+2) * (o+1);
      wsum += w; for(let i=0;i<5;i++) out[i] += w*d[i];
    }
    return wsum ? out.map(v=>v/wsum) : null;
  },
  update(tok, last1, last2){
    for(let o=0;o<3;o++){
      const d = this.dist(o,last1,last2);
      if(d){ this.acc[o].p++; if(d.indexOf(Math.max(...d))===tok) this.acc[o].h++; }
    }
    const m = this.mix(last1,last2);
    if(m){ this.lifeP++; if(m.indexOf(Math.max(...m))===tok) this.lifeH++; }
    this.c0[tok]++; this.c1[last1][tok]++; this.c2[last2*5+last1][tok]++;
    this.n++; this.dirty = true;
    if(this.n % 500 === 0){                  // slow decay: it adapts to who you are becoming
      const dk = r => { for(let i=0;i<5;i++) r[i]*=.9; };
      dk(this.c0); this.c1.forEach(dk); this.c2.forEach(dk);
    }
  },
  accuracy(){ return this.lifeP ? Math.round(100*this.lifeH/this.lifeP) : null; },
  pack(){
    return JSON.stringify({c0:this.c0,c1:this.c1,c2:this.c2,acc:this.acc,n:this.n,runs:this.runs,
      lifeP:this.lifeP,lifeH:this.lifeH,warden:this.warden,theft:this.theft,ent:this.ent});
  },
  unpack(s){
    try{
      const d = JSON.parse(s);
      if(!d || !Array.isArray(d.c0) || d.c0.length!==5) return false;
      Object.assign(this, d); return true;
    }catch(e){ return false; }
  },
  reset(){
    this.c0.fill(0); this.c1.forEach(r=>r.fill(0)); this.c2.forEach(r=>r.fill(0));
    this.acc = [{p:0,h:0},{p:0,h:0},{p:0,h:0}];
    this.n=0; this.runs=0; this.lifeP=0; this.lifeH=0; this.warden=[];
    this.theft={oT:0,oO:0,uT:0,uO:0}; this.ent=0; this.dirty=false;
  }
};

async function saveCore(){ Core.dirty=false; await Store.set(KEYS.core, Core.pack()); }
async function loadCore(){ const raw = await Store.get(KEYS.core); if(raw) Core.unpack(raw); }
async function wipeCore(){ Core.reset(); await Store.del(KEYS.core); }

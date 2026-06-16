'use strict';
/* Storage adapter. Tries, in order:
   1. window.storage  (Claude artifact persistent storage)
   2. localStorage    (standalone file / served)
   3. in-memory       (always works, session only)                       */
const Store = {
  mem: {},
  backend: 'memory',
  async get(k){
    try{ if(window.storage){ const r = await window.storage.get(k); this.backend='artifact'; return r ? r.value : null; } }catch(e){ if(window.storage)this.backend='artifact'; }
    try{ if(window.localStorage){ this.backend='local'; return localStorage.getItem(k); } }catch(e){}
    return (k in this.mem) ? this.mem[k] : null;
  },
  async set(k,v){
    try{ if(window.storage){ await window.storage.set(k,v); this.backend='artifact'; return; } }catch(e){}
    try{ if(window.localStorage){ localStorage.setItem(k,v); this.backend='local'; return; } }catch(e){}
    this.mem[k]=v; this.backend='memory';
  },
  async del(k){
    try{ if(window.storage){ await window.storage.delete(k); return; } }catch(e){}
    try{ if(window.localStorage){ localStorage.removeItem(k); return; } }catch(e){}
    delete this.mem[k];
  }
};

const KEYS = { core:'tp_core_v3', run:'tp_run_v1', settings:'tp_settings_v1' };

/* Player settings + one-time tip flags */
const S = { sound:true, flash:true, tips:{} };
async function loadSettings(){
  const raw = await Store.get(KEYS.settings);
  if(raw){ try{ Object.assign(S, JSON.parse(raw)); }catch(e){} }
}
async function saveSettings(){ await Store.set(KEYS.settings, JSON.stringify(S)); }

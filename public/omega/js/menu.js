'use strict';
/* Screens: home / core / manual / settings / pause. The game sits under #screen-game. */
const Menu = {
  open:true,

  async show(screen){
    this.open=true;
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));
    $('screen-'+screen).classList.add('on');
    $('screen-game').classList.toggle('dim', G.active);
    if(screen==='home') await this.refreshHome();
    if(screen==='core') this.refreshCore();
  },
  hide(){
    this.open=false;
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));
    $('screen-game').classList.remove('dim');
  },

  async refreshHome(){
    const cont=$('mContinue');
    cont.style.display=(await hasRun())?'block':'none';
    $('mResume').style.display=(G.active&&!G.over)?'block':'none';
    const acc=Core.accuracy();
    $('mCoreLine').innerHTML = Core.n<1
      ? 'it has never seen you. <b>start with calibration.</b>'
      : `it has <b>${Math.round(Core.n)}</b> training examples of you across <b>${Core.runs}</b> runs · lifetime accuracy <b>${acc===null?'—':acc+'%'}</b>`;
    $('mStorage').textContent='memory backend: '+Store.backend+(Store.backend==='memory'?' (session only — nothing persists after this tab closes)':'');
  },

  refreshCore(){
    const acc=Core.accuracy(), ir=integrityReport();
    const w=Core.warden;
    $('coreStats').innerHTML=
      `training examples <b>${Math.round(Core.n)}</b> · runs witnessed <b>${Core.runs}</b><br>`+
      `lifetime accuracy on you <b>${acc===null?'—':acc+'%'}</b> over ${Core.lifeP} predictions<br>`+
      `warden verdicts: <b>${w.length? w.join(', ') : 'none yet — it will guess from your thefts'}</b><br>`+
      `integrity watched <b>${ir.o===null?'—':ir.o+'%'}</b> · unwatched <b>${ir.u===null?'—':ir.u+'%'}</b>`;
    $('coreIO').value='';
  },

  exportCore(){ $('coreIO').value=Core.pack(); $('coreIO').select(); say2('coreMsg','its memory, serialized. copy it. trade nemeses with someone.'); },
  async importCore(){
    const ok=Core.unpack($('coreIO').value.trim());
    if(ok){ await saveCore(); this.refreshCore(); say2('coreMsg','imported. it remembers someone now — possibly you.'); }
    else say2('coreMsg','that is not a mind. import failed.');
  },
  async wipe(){
    if(!confirm('Erase everything it has learned about you?'))return;
    await wipeCore(); this.refreshCore();
    say2('coreMsg','its memory is gone. it is innocent again. that was a kind of killing too.');
  },

  startRun(){ this.hide(); newRun('run'); },
  startMass(){ this.hide(); newRun('mass'); },
  startTutorial(){ this.hide(); newRun('tutorial'); },
  async continueRun(){ if(await continueRun()) this.hide(); },
  resume(){ this.hide(); },
  async abandon(){
    if(!confirm('Abandon this run? The floor checkpoint will be erased. It keeps what it learned.'))return;
    G.active=false; G.over=true; await clearRun(); this.show('home');
  },
  afterTutorial(){ /* end-screen buttons route via over overlay */ },

  toggleSound(){ S.sound=!S.sound; saveSettings(); $('sSound').textContent=S.sound?'ON':'OFF'; },
  toggleFlash(){ S.flash=!S.flash; saveSettings(); $('sFlash').textContent=S.flash?'ON':'OFF'; },
  async resetTips(){ S.tips={}; await saveSettings(); say2('setMsg','contextual tips will appear again.'); },
};

function say2(id,t){ $(id).textContent=t; }

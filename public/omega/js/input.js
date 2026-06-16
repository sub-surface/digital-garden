'use strict';
/* Input: keyboard, d-pad, swipe-to-move, tap-to-probe, ESC pauses. */
function doMove(tok){ SFX.move(tok); step(tok); }

function bindInput(){
  document.querySelectorAll('.pan-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      tab.parentElement.classList.toggle('minimized');
    });
  });

  addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(Menu.open&&G.active&&!G.over)Menu.resume();
      else if(!Menu.open)Menu.show('home');
      return;
    }
    if(Menu.open)return;
    if(G.over){ if(e.key==='r'||e.key==='R'){ newRun(G.mode); } return; }
    const map={ArrowLeft:0,a:0,ArrowUp:1,w:1,ArrowRight:2,d:2,ArrowDown:3,s:3,' ':4,'.':4};
    if(e.key in map){ e.preventDefault(); doMove(map[e.key]); }
    else if(e.key==='m'||e.key==='M'){ Menu.toggleSound(); }
  });

  document.querySelectorAll('#pad button[data-d]').forEach(b=>b.addEventListener('click',()=>{ if(!Menu.open)doMove(+b.dataset.d); }));
  $('aMenu').addEventListener('click',()=>Menu.show('home'));

  let t0=null;
  const board=$('board');
  board.addEventListener('pointerdown',e=>{ t0={x:e.clientX,y:e.clientY}; });
  board.addEventListener('pointerup',e=>{
    if(!t0||Menu.open)return;
    const dx=e.clientX-t0.x, dy=e.clientY-t0.y;
    const tap=Math.abs(dx)<16&&Math.abs(dy)<16; t0=null;
    if(tap){
      const cell=e.target.closest('.cell'); if(!cell)return;
      const i=+cell.dataset.i, x=i%W, y=(i-x)/W;
      const en=G.enemies.find(e=>e.x===x&&e.y===y);
      if(en){ selected=en; say('probe: '+en.obj); drawAll(); return; }
      if(x===G.player.x&&y===G.player.y){ doMove(4); return; }
      return;
    }
    if(G.over)return;
    doMove(Math.abs(dx)>Math.abs(dy)?(dx>0?2:0):(dy>0?3:1));
  });

  /* end-screen buttons */
  $('retry').addEventListener('click',()=>{ if(G.mode==='tutorial'){ Menu.show('home'); } else newRun('run'); });
  $('toMenu').addEventListener('click',()=>Menu.show('home'));

  /* menu wiring */
  $('mContinue').addEventListener('click',()=>Menu.continueRun());
  $('mResume').addEventListener('click',()=>Menu.resume());
  $('mNew').addEventListener('click',async()=>{
    if(await hasRun()&&!confirm('Start a new run? Your floor checkpoint will be overwritten.'))return;
    Menu.startRun();
  });
  $('mTut').addEventListener('click',()=>Menu.startTutorial());
  $('mMass').addEventListener('click',()=>Menu.startMass());
  $('mCore').addEventListener('click',()=>Menu.show('core'));
  $('mManual').addEventListener('click',()=>Menu.show('manual'));
  $('mSettings').addEventListener('click',()=>Menu.show('settings'));
  document.querySelectorAll('.back').forEach(b=>b.addEventListener('click',()=>Menu.show('home')));
  $('coreExport').addEventListener('click',()=>Menu.exportCore());
  $('coreImport').addEventListener('click',()=>Menu.importCore());
  $('coreWipe').addEventListener('click',()=>Menu.wipe());
  $('sSoundBtn').addEventListener('click',()=>Menu.toggleSound());
  $('sFlashBtn').addEventListener('click',()=>Menu.toggleFlash());
  $('sTips').addEventListener('click',()=>Menu.resetTips());
  $('mAbandon').addEventListener('click',()=>Menu.abandon());
}

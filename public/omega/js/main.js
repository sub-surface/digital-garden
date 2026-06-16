'use strict';
/* Boot sequence. */
(async function boot(){
  await loadSettings();
  await loadCore();
  buildBoard();
  bindInput();
  $('sSound').textContent=S.sound?'ON':'OFF';
  $('sFlash').textContent=S.flash?'ON':'OFF';
  await Menu.show('home');
  setInterval(()=>{ if(Core.dirty)saveCore(); }, 8000);
})();

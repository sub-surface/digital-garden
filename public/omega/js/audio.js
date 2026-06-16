'use strict';
/* All audio is synthesized. PITCH maps the five actions (←↑→↓·) to notes;
   the "pre-echo" plays the predicted action's note before the player acts. */
let AC = null;
const PITCH = [330, 392, 440, 494, 262];

function tone(f, dur, g, type){
  if(!S.sound) return;
  try{
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if(AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), gn = AC.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    gn.gain.setValueAtTime(g, AC.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.connect(gn); gn.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + dur);
  }catch(e){}
}

const SFX = {
  move:  tok => tone(PITCH[tok], .05, .03),
  echo:  tok => tone(PITCH[tok], .09, .018),
  hit:   ()  => tone(80,  .18, .06, 'sawtooth'),
  kill:  ()  => tone(120, .12, .05, 'square'),
  pick:  ()  => tone(587, .07, .025),
  ui:    ()  => tone(262, .05, .02),
};

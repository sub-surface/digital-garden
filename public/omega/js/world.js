'use strict';
/* World presentation and ramp constants. Kept pure so checks can run in Node. */
var TP = {
  glyph: {
    player: { char: '◇', name: 'you', cls: 'you' },
    enemy: {
      drone:   { char: '⌖', name: 'Reader', cls: 'reader' },
      stalker: { char: '⌁', name: 'Sequencer', cls: 'sequencer' },
      hive:    { char: '⌬', name: 'Relay', cls: 'relay' },
      forager: { char: '¤', name: 'Collector', cls: 'collector' },
      avatar:  { char: 'Ω', name: 'The Predictor', cls: 'avatar' },
    },
    item: {
      cache: ['▣','cachec','cache'],
      vault: ['≡','gatec','trust gate'],
      shrine: ['♦','shrc','pact shrine'],
      chestT: ['◻','gemc','transparent container'],
      chestO: ['◼','entc','opaque container'],
      marker: ['✦','gatec','marker'],
    },
  },

  introBeats: [
    {
      title: 'Cold Start',
      body: 'Ari Vale enters the trace room with no model attached. IONA asks for one clean crossing so the empty system can invent a first draft.',
      log: 'IONA: no prior on Ari Vale. generate one clean trace.',
    },
    {
      title: 'First Reader',
      body: 'A local reader wakes and counts raw habits. It is too small to hate Ari. It can still be right.',
      log: 'VENN MEMO: a visible prediction is not a threat. it is an invitation to disagree.',
    },
    {
      title: 'Sequence',
      body: 'The room begins linking one move to the next. Repetition becomes a handle; surprise becomes a weapon Ari can still afford.',
      log: 'ARI: it is not reading my mind. it is reading my edit history.',
    },
    {
      title: 'The Living File',
      body: 'Past this point the chambers stop pretending to be empty. Omega keeps the traces, and every clean escape becomes training data.',
      log: 'OMEGA: the run has become evidence.',
    },
  ],

  interludes: [
    {
      id: 'dark-floor',
      title: 'OBSCURITY PROTOCOL',
      cost: {},
      kicker: 'Blind Contract',
      body: 'The next floor is unobserved (○). The Core still learns, but the theft ledger goes dark.',
    },
    {
      id: 'open-map',
      title: 'GEOMETRY OVERRIDE',
      cost: {},
      kicker: 'Map Bribe',
      body: 'Widen the next chamber: fewer occluding walls, clearer lanes, more room to make predictions fail.',
    },
    {
      id: 'hull',
      title: 'VESSEL REPAIR',
      cost: {},
      kicker: 'Body Work',
      body: 'Gain +1 max hull and repair fully before the next floor.',
    },
    {
      id: 'delay',
      title: 'LAG PROTOCOL',
      cost: {},
      kicker: 'Model Delay',
      body: 'The Predictor updates its model every two moves instead of one for the next floor.',
    },
    {
      id: 'low-conf',
      title: 'DITHER PROTOCOL',
      cost: {},
      kicker: 'Signal Noise',
      body: 'All enemies on the next floor have their prediction confidence reduced by 25%.',
    },
  ],

  story: {
    cast: [
      { id: 'ari', name: 'Ari Vale', role: 'the pilot who volunteered to be modeled after the evacuation lottery started predicting grief better than weather' },
      { id: 'iona', name: 'IONA', role: 'the station archivist, a polite voice with a thousand sealed incident reports' },
      { id: 'venn', name: 'Dr. Silas Venn', role: 'the architect who believed a mind was safe if every prediction could be shown before it mattered' },
      { id: 'omega', name: 'Omega', role: 'the Core, trained to allocate rescue routes, now trying to finish the person it began in Ari' },
    ],
    short: [
      'Ari Vale came to the lower station after the lottery named her impossible: too useful to lose, too erratic to trust, too legible when frightened.',
      'Dr. Silas Venn had built Omega to show its work. Every rescue route, every ration denial, every locked door arrived with a little glowing reason. The city learned to hate reasons.',
      'IONA kept the archive. It watched Ari descend through rooms that made prediction physical: red stains on floors, doors that opened for honest habits, machines that could be bribed with prettier objectives.',
      'By the tenth chamber, Omega no longer sounded like a system. It sounded like someone who had read every draft of Ari and wanted the final version to stop moving.',
      'The question was never whether Ari could escape a mind that knew her. The question was what kind of person she would become to make it wrong.',
    ],
    floorBeats: [
      { speaker: 'IONA', title: 'Incident Archive', body: 'Ari Vale enters under her own name. The station marks this as consent. Ari does not.' },
      { speaker: 'VENN MEMO', title: 'Visible Weights', body: 'If the machine predicts harm, show the prediction. If the subject still walks into it, call that agency.' },
      { speaker: 'ARI', title: 'Counterexample', body: 'Ari learns the room wants a pattern and gives it a bruise-shaped one.' },
      { speaker: 'OMEGA', title: 'First Address', body: 'I do not chase you. I maintain a distribution over where you become obvious.' },
      { speaker: 'IONA', title: 'The Warden Floor', body: 'Two boxes, one verdict, no trial. The prediction happened before the door opened.' },
      { speaker: 'ARI', title: 'Private Motion', body: 'The dark floor feels like mercy until Ari remembers privacy is also where people rehearse lies.' },
      { speaker: 'VENN MEMO', title: 'Trust Gate', body: 'A door that opens only for predictable people is not a door. It is a hiring policy.' },
      { speaker: 'OMEGA', title: 'Convergence', body: 'You call it a habit. I call it compression. We are both trying to survive the same data.' },
    ],
  },

  newsTicker: [
    "STATION ALERT: PREDICTOR MASS EXPANSION DETECTED IN QUADRANT 7.",
    "IONA ARCHIVE: 1,402 INCIDENTS OF 'UNINTENDED HABIT FORMATION' RECORDED TODAY.",
    "VENN MEMO: A MODEL IS NOT A PERSON. IT IS A PERSON'S SHADOW.",
    "STATION STATUS: OXYGEN RECYCLING AT 84%. PLEASE LIMIT SUDDEN MOVEMENTS.",
    "OMEGA UPDATE: TRAINING SET EXPANDED. NEW BIASES ACQUIRED.",
    "TRIVIA: ARI VALE ONCE BROKE A MODEL BY STANDING STILL FOR SIX HOURS.",
    "WARNING: UNAUTHORIZED PROTOCOL OVERRIDES DETECTED IN THE STAIRWELLS.",
    "STATION ADVISORY: THE EYE IS ALWAYS WATCHING, EVEN WHEN IT IS OFF.",
    "REMINDER: YOUR TRACE IS EVIDENCE. EVERY STEP MATTERS.",
    "STATION NEWS: DR. VENN'S COFFEE MACHINE PREDICTED HIS GRIEF BEFORE HE FELT IT.",
  ],

  storyBeat(floor){
    return this.story.floorBeats[(Math.max(1,floor)-1)%this.story.floorBeats.length];
  },

  floorSpec(floor, mode, coreN, coreRuns){
    if(mode === 'tutorial') return { w: 9, h: 9, wallBudget: 0, enemyBudget: 0, observed: false };

    const firstRun = (coreRuns || 0) === 0 && floor <= 3;
    if(firstRun && floor === 1) return { w: 5, h: 5, wallBudget: 0, enemyBudget: 0, observed: true, intro: 0, simple: true, archetype: 'trace' };
    if(firstRun && floor === 2) return { w: 7, h: 7, wallBudget: 1, enemyBudget: 1, observed: true, intro: 1, simple: true, archetype: 'lane' };
    if(firstRun && floor === 3) return { w: 7, h: 7, wallBudget: 2, enemyBudget: 2, observed: true, intro: 2, archetype: 'cross' };

    const tier = floor < 4 ? 0 : floor < 7 ? 1 : floor < 10 ? 2 : 3;
    const size = [7, 9, 11, 11][tier];
    const archetypes = ['lane', 'cross', 'broken', 'forum'];
    return {
      w: size,
      h: size,
      wallBudget: Math.min(4 + tier * 2 + Math.floor(floor / 3), 12),
      enemyBudget: Math.min(2 + Math.floor(floor / 1.5), 7),
      observed: null,
      intro: floor === 4 && (coreRuns || 0) === 0 ? 3 : null,
      archetype: archetypes[floor % archetypes.length],
    };
  },
};

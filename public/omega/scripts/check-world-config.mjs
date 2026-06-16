import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "js/world.js"), "utf8");
const context = {};

vm.createContext(context);
vm.runInContext(source, context, { filename: "js/world.js" });

const { TP } = context;
if (!TP) throw new Error("TP world config was not defined");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const tutorial = TP.floorSpec(1, "tutorial", 0);
assert(tutorial.w === 9 && tutorial.h === 9, "tutorial must stay 9x9 unless authored coordinates change");

const first = TP.floorSpec(1, "run", 0);
assert(first.w === 5 && first.h === 5, "first fresh run floor should start on a 5x5 board");
assert(first.enemyBudget === 0, "first fresh run floor should not spawn enemies");
assert(first.wallBudget === 0, "first fresh run floor should be visually simple");

const second = TP.floorSpec(2, "run", 0);
assert(second.w === 7 && second.h === 7, "second fresh run floor should expand to 7x7");
assert(second.enemyBudget === 1, "second fresh run floor should introduce one reader");

const late = TP.floorSpec(8, "run", 120);
assert(late.w === 11 && late.h === 11, "late run floors should expand to 11x11");
assert(late.enemyBudget >= 5, "late run floors should carry real density");

for (const type of ["drone", "stalker", "hive", "forager", "avatar"]) {
  const glyph = TP.glyph.enemy[type];
  assert(glyph && !/^[dSHf]$/.test(glyph.char), `${type} should use a non-placeholder board glyph`);
  assert(glyph.name, `${type} glyph should expose a readable name`);
}

assert(TP.introBeats.length >= 4, "first-run intro should have multiple diegetic beats");
assert(TP.story && TP.story.cast.length >= 3, "story should define a small cast");
assert(TP.story.short.length >= 4, "story should include a short fiction spine");
assert(TP.story.floorBeats.length >= 6, "story should include paced floor beats");
for (const beat of TP.story.floorBeats) {
  assert(beat.speaker && beat.title && beat.body, "each floor beat needs speaker/title/body");
}

const interludeIds = TP.interludes.map((choice) => choice.id);
for (const id of ["dark-floor", "open-map", "hull", "drill", "leave"]) {
  assert(interludeIds.includes(id), `missing interlude choice ${id}`);
}
assert(TP.floorSpec(6, "run", 80, 0).archetype, "run floors should expose a map archetype");

console.log("World config checks passed.");

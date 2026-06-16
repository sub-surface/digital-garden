import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(import.meta.dirname, "..", "css/style.css"), "utf8");
const get = (name) => css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const attn = get("--attn");
const cool = get("--cool");
const bliss = get("--bliss");
assert(attn, "missing --attn token");
assert(cool, "missing --cool token");
assert(bliss, "missing --bliss token");

const [r, g, b] = rgb(attn);
assert(r > 170 && g < 120 && b < 120, "--attn should be a restrained red accent, not yellow/green");
assert(cool !== attn && bliss !== attn, "secondary accents should stay distinct from red");
assert(!css.includes("#d2c76e"), "old yellow attention color should not remain");
assert(!/gradient/i.test(css), "flat style should not use gradients");

console.log("Theme checks passed.");

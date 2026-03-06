import assert from 'node:assert';

function slugify(raw) {
  // Simulating the prebuild logic
  return raw
    .replace(/\\/g, "/")
    .replace(/\.mdx?$/, "")
    .replace(/\/index$/, "")
    .replace(/\s+/g, "-")
}

function frontendSlug(raw) {
  // Simulating updated NoteRenderer/NoteBody logic
  return decodeURIComponent(raw)
    .replace(/\.mdx?$/, "")
    .replace(/\s+/g, "-")
}

// Test cases
const cases = [
  { input: "a place I'll always call home", expected: "a-place-I'll-always-call-home" },
  { input: "Movies/2001 A Space Odyssey", expected: "Movies/2001-A-Space-Odyssey" },
  { input: "hello world.md", expected: "hello-world" },
  { input: "Multiple   Spaces", expected: "Multiple-Spaces" },
  { input: "folder/note name.mdx", expected: "folder/note-name" }
];

console.log("Running slugification tests (v2)...");

cases.forEach(({ input, expected }) => {
  const prebuild = slugify(input);
  const frontend = frontendSlug(input);
  
  console.log(`Input: "${input}"`);
  console.log(`  Prebuild: ${prebuild}`);
  console.log(`  Frontend: ${frontend}`);
  
  assert.strictEqual(prebuild, expected, `Prebuild slug mismatch for ${input}`);
  assert.strictEqual(frontend, expected, `Frontend slug mismatch for ${input}`);
});

console.log("\nAll tests passed! Slug handling is consistent between prebuild and frontend.");

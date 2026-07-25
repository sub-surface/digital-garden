// ESLint config — ROADMAP §28.3.
//
// WHY THIS EXISTS: the codebase carried 18 `// eslint-disable-next-line
// react-hooks/exhaustive-deps` comments while no ESLint was installed at all — no
// config, no dependency, no script. The suppressions enforced nothing, and worse,
// each one marked a hand-audited dependency array that no tool could re-verify.
// The `useFocusTrap` regression (inline callbacks in the dep array tore the trap
// down on every parent re-render) is exactly that bug class. So the point of this
// config is narrow and specific: make those comments mean something again.
//
// DELIBERATELY MINIMAL. This is not a style linter — the repo has no formatter
// fight to pick and 115 .tsx files that were never linted, so enabling a broad
// recommended set would produce hundreds of findings and get switched off. Only
// the React Hooks rules are on. `typescript-eslint`'s parser is used WITHOUT
// type-aware linting (no `project` service), which keeps `npm run lint` fast
// enough to sit inside `npm run check`.
//
// If you want to widen this later, add rules one at a time with the tree green.

import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"

export default [
  {
    // The whole reason this config exists is that suppressions had drifted loose
    // from reality — three of the original eighteen turned out to suppress nothing
    // at all. Making a dead directive an error means that can't silently recur:
    // fix the hook or drop the comment, but don't leave a comment that lies.
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    // content/ is the Obsidian vault — it ships vendored plugin bundles
    // (.obsidian/plugins/**/main.js) whose own inline eslint-disable comments
    // reference rules we don't install, which ESLint reports as errors. It is not
    // source. src/content/ is generated (wiped and re-synced by every prebuild),
    // dist/ is build output, public/ holds assets + generated manifests.
    ignores: [
      "dist/**",
      "content/**",
      "src/content/**",
      ".wrangler/**",
      "scratch/**",
      "public/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
]

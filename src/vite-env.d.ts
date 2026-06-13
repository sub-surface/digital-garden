/// <reference types="vite/client" />

// Build-time constants injected by vite `define` (see vite.config.ts).
declare const __COMMIT_SHA__: string       // short 7-char SHA, or "dev"
declare const __COMMIT_SHA_FULL__: string  // full SHA, or "dev"

declare module "*.module.scss" {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module "*.scss" {
  const content: string
  export default content
}

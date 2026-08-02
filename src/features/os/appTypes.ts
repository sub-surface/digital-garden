export interface AppProps {
  args: Record<string, string>
  /** The window this app is mounted in — lets an app close or retitle itself. */
  windowId: string
}

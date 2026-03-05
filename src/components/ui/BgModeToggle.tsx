import { useStore } from "@/store"

export function BgModeToggle() {
  const bgMode = useStore((s) => s.bgMode)
  const cycleBg = useStore((s) => s.cycleBgMode)

  const getLabel = () => {
    switch (bgMode) {
      case "graph": return "Graph"
      case "vectors": return "Vectors"
      case "dots": return "Dots"
      case "terminal": return "Terminal"
      default: return bgMode
    }
  }

  return (
    <button 
      className="quick-icon-btn" 
      onClick={cycleBg}
      title={`Cycle Background: ${getLabel()}`}
      data-panel-ignore
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      </svg>
    </button>
  )
}

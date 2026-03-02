import { useStore } from "@/store"
import { useNavigate } from "@tanstack/react-router"
import { PanelCard } from "./PanelCard"
import styles from "./Panel.module.scss"

export function PanelStack() {
  const panelStack = useStore((s) => s.panelStack)
  const removeCard = useStore((s) => s.removeCard)
  const clearStack = useStore((s) => s.clearStack)
  const navigate = useNavigate()

  if (panelStack.length === 0) return null

  function handlePromote(index: number) {
    const card = panelStack[index]
    if (!card) return
    // Navigate main body to this card's slug, clear the panel
    clearStack()
    navigate({ to: `/${card.slug}` })
  }

  function handleClose(index: number) {
    removeCard(index)
  }

  return (
    <div className={styles.stack}>
      {panelStack.map((card, i) => (
        <PanelCard
          key={`${card.slug}-${i}`}
          title={card.title}
          html={card.html}
          index={i}
          onClose={() => handleClose(i)}
          onPromote={() => handlePromote(i)}
        />
      ))}
    </div>
  )
}

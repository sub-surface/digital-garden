export interface OSMenuItem {
  label: string
  onSelect?: () => void
  disabled?: boolean
  separatorAfter?: boolean
}

export interface OSMenu {
  label: string
  items: OSMenuItem[]
}

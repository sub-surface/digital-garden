import { useState, useEffect, useRef, type RefObject } from "react"
import { createPortal } from "react-dom"
import { useStore } from "@/store"
import styles from "./ChatSettings.module.scss"

const PRESET_COLORS = [
  "#e05555", "#e08a55", "#e0c855", "#6dbf6d", "#55b4e0",
  "#7c6de0", "#c86de0", "#e06d9e", "#55e0c8", "#e0e0e0",
  "#b4424c", "#b48242", "#8fb442", "#42b464", "#4282b4",
  "#6442b4", "#b44282", "#42b4b4", "#b4b442", "#8a8a8a",
]

interface StonkConfigRow {
  key: string
  value: number
}

interface ApiKey {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

interface Props {
  anchorRef: RefObject<HTMLElement | null>
  currentColor: string | null
  onSave: (color: string | null) => void
  onClose: () => void
  isAdmin?: boolean
  accessToken?: string
}

type Tab = "appearance" | "keys" | "admin"

export function ChatSettings({ anchorRef, currentColor, onSave, onClose, isAdmin, accessToken }: Props) {
  const [tab, setTab] = useState<Tab>("appearance")
  const [color, setColor] = useState(currentColor ?? "")
  const ref = useRef<HTMLDivElement>(null)
  const chatDensity = useStore((s) => s.chatDensity)
  const setChatDensity = useStore((s) => s.setChatDensity)
  const chatFontScale = useStore((s) => s.chatFontScale)
  const setChatFontScale = useStore((s) => s.setChatFontScale)

  const DENSITY_OPTIONS = ["compact", "comfortable", "spacious"] as const
  const SCALE_OPTIONS = [
    { label: "S", value: 0.85 },
    { label: "M", value: 1.0 },
    { label: "L", value: 1.15 },
  ]

  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  // Stonk config (admin tab)
  const [stonkConfig, setStonkConfig] = useState<StonkConfigRow[]>([])
  const [stonkLoading, setStonkLoading] = useState(false)

  // API keys tab
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [keysLoading, setKeysLoading] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [keyCopied, setKeyCopied] = useState(false)

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
  }, [anchorRef])

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKey)
    }
  }, [onClose])

  // Load stonk config when admin tab opens
  useEffect(() => {
    if (tab !== "admin" || !isAdmin || !accessToken) return
    setStonkLoading(true)
    fetch("/api/admin/stonk-config", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: StonkConfigRow[]) => setStonkConfig(data))
      .catch(() => {})
      .finally(() => setStonkLoading(false))
  }, [tab, isAdmin, accessToken])

  // Load API keys when keys tab opens
  useEffect(() => {
    if (tab !== "keys" || !accessToken) return
    setKeysLoading(true)
    fetch("/api/admin/api-keys", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: ApiKey[]) => setApiKeys(data.filter(k => !k.revoked_at)))
      .catch(() => {})
      .finally(() => setKeysLoading(false))
  }, [tab, accessToken])

  function handleSelect(hex: string) { setColor(hex); onSave(hex) }
  function handleReset() { setColor(""); onSave(null) }
  function handleHexSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = color.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) onSave(trimmed)
  }

  async function handleGenerateKey() {
    if (!accessToken) return
    const name = newKeyName.trim() || "API Key"
    const res = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return
    const data = await res.json() as { key: string; name: string }
    setGeneratedKey(data.key)
    setNewKeyName("")
    setKeyCopied(false)
    // Refresh list
    fetch("/api/admin/api-keys", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: ApiKey[]) => setApiKeys(d.filter(k => !k.revoked_at)))
      .catch(() => {})
  }

  async function handleRevokeKey(id: string) {
    if (!accessToken) return
    await fetch(`/api/admin/api-keys/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    setApiKeys(prev => prev.filter(k => k.id !== id))
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "appearance", label: "appearance" },
    { id: "keys", label: "api keys" },
    ...(isAdmin ? [{ id: "admin" as Tab, label: "admin" }] : []),
  ]

  return createPortal(
    <div
      className={styles.settings}
      ref={ref}
      style={pos ? { top: pos.top, right: pos.right } : { visibility: "hidden" }}
    >
      <div className={styles.tabs}>
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ""}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {tab === "appearance" && (
        <div className={styles.tabContent}>
          <div className={styles.sectionLabel}>name colour</div>
          <div className={styles.swatchGrid}>
            {PRESET_COLORS.map((hex) => (
              <button
                key={hex}
                className={`${styles.swatch} ${color === hex ? styles.swatchActive : ""}`}
                style={{ backgroundColor: hex }}
                onClick={() => handleSelect(hex)}
                title={hex}
                type="button"
              />
            ))}
          </div>
          <form className={styles.hexRow} onSubmit={handleHexSubmit}>
            <input
              className={styles.hexInput}
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#RRGGBB"
              maxLength={7}
              autoComplete="off"
            />
            {color && (
              <span className={styles.preview} style={{ color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined }}>
                preview
              </span>
            )}
          </form>
          <button className={styles.resetBtn} onClick={handleReset} type="button">
            reset to default
          </button>

          <div className={styles.divider} />
          <div className={styles.sectionLabel}>density</div>
          <div className={styles.densityRow}>
            {DENSITY_OPTIONS.map(d => (
              <button key={d} type="button"
                className={`${styles.segBtn} ${chatDensity === d ? styles.segBtnActive : ""}`}
                onClick={() => setChatDensity(d)}
              >{d}</button>
            ))}
          </div>

          <div className={styles.sectionLabel}>text size</div>
          <div className={styles.scaleRow}>
            {SCALE_OPTIONS.map(o => (
              <button key={o.value} type="button"
                className={`${styles.segBtn} ${styles.segBtnWide} ${chatFontScale === o.value ? styles.segBtnActive : ""}`}
                onClick={() => setChatFontScale(o.value)}
              >{o.label}</button>
            ))}
          </div>
        </div>
      )}

      {tab === "keys" && (
        <div className={styles.tabContent}>
          {generatedKey && (
            <div className={styles.generatedKey}>
              <div className={styles.generatedKeyLabel}>copy now — shown once</div>
              <div className={styles.generatedKeyValue}>{generatedKey}</div>
              <button
                type="button"
                className={styles.copyBtn}
                onClick={() => { navigator.clipboard.writeText(generatedKey); setKeyCopied(true) }}
              >{keyCopied ? "copied!" : "copy"}</button>
            </div>
          )}
          <div className={styles.keyGenRow}>
            <input
              className={styles.keyNameInput}
              type="text"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="key name (optional)"
              maxLength={40}
              autoComplete="off"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleGenerateKey() } }}
            />
            <button type="button" className={styles.generateBtn} onClick={handleGenerateKey}>
              generate
            </button>
          </div>
          {keysLoading ? (
            <div className={styles.loadingText}>loading...</div>
          ) : apiKeys.length === 0 ? (
            <div className={styles.emptyText}>no active keys</div>
          ) : (
            <div className={styles.keyList}>
              {apiKeys.map(k => (
                <div key={k.id} className={styles.keyRow}>
                  <div className={styles.keyInfo}>
                    <span className={styles.keyName}>{k.name}</span>
                    <span className={styles.keyMeta}>
                      {k.last_used_at
                        ? `used ${new Date(k.last_used_at).toLocaleDateString()}`
                        : `created ${new Date(k.created_at).toLocaleDateString()}`}
                    </span>
                  </div>
                  <button type="button" className={styles.revokeBtn} onClick={() => handleRevokeKey(k.id)}>
                    revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "admin" && isAdmin && accessToken && (
        <div className={styles.tabContent}>
          <div className={styles.sectionLabel}>stonk config</div>
          {stonkLoading ? (
            <div className={styles.loadingText}>loading...</div>
          ) : (
            <div className={styles.stonkTable}>
              {stonkConfig.map((row) => (
                <div key={row.key} className={styles.stonkRow}>
                  {row.key === "stonks_enabled" ? (
                    <>
                      <span className={styles.stonkKey}>{row.key}</span>
                      <button
                        className={`${styles.stonkToggle} ${row.value ? styles.stonkToggleOn : ""}`}
                        onClick={() => {
                          const newVal = row.value ? 0 : 1
                          setStonkConfig(prev => prev.map(r => r.key === row.key ? { ...r, value: newVal } : r))
                          fetch("/api/admin/stonk-config", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
                            body: JSON.stringify({ key: row.key, value: newVal }),
                          }).catch(() => {
                            setStonkConfig(prev => prev.map(r => r.key === row.key ? { ...r, value: row.value } : r))
                          })
                        }}
                        type="button"
                      >{row.value ? "on" : "off"}</button>
                    </>
                  ) : (
                    <>
                      <span className={styles.stonkKey}>{row.key}</span>
                      <input
                        className={styles.stonkInput}
                        type="number"
                        value={row.value}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10)
                          if (isNaN(val)) return
                          setStonkConfig(prev => prev.map(r => r.key === row.key ? { ...r, value: val } : r))
                        }}
                        onBlur={() => {
                          fetch("/api/admin/stonk-config", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
                            body: JSON.stringify({ key: row.key, value: row.value }),
                          }).catch(() => {})
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  )
}

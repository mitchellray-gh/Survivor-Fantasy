import { useState, type FormEvent } from 'react'
import type { Player } from '../data/players'
import type { PlayerStatus } from '../data/storage'
import { getAdminKey, setAdminKey } from '../data/storage'

interface AdminDrawerProps {
  isOpen: boolean
  onClose: () => void
  players: Player[]
  onPlayerStatusChange: (playerId: number, status: PlayerStatus) => void
  onOverrideChange: (playerId: number, episode: number, delta: number, reason: string | null) => void
}

const STATUSES: PlayerStatus[] = ['active', 'voted_out', 'medevac', 'quit', 'winner']

const STATUS_LABEL: Record<PlayerStatus, string> = {
  active:    'Active',
  voted_out: 'Voted out',
  medevac:   'Medevac',
  quit:      'Quit',
  winner:    'Winner',
}

function AdminDrawer({ isOpen, onClose, players, onPlayerStatusChange, onOverrideChange }: AdminDrawerProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | ''>(players[0]?.id ?? '')
  const [episode, setEpisode] = useState(1)
  const [delta, setDelta] = useState(0)
  const [reason, setReason] = useState('')
  const [keyDraft, setKeyDraft] = useState(() => getAdminKey())
  const [keySaved, setKeySaved] = useState(false)

  if (!isOpen) return null

  const handleSaveKey = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAdminKey(keyDraft.trim())
    setKeyDraft(getAdminKey())
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
  }

  const selectedPlayer = players.find(p => p.id === selectedPlayerId)

  const handleOverrideSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (selectedPlayerId === '' || Number.isNaN(episode) || Number.isNaN(delta)) return
    onOverrideChange(Number(selectedPlayerId), episode, delta, reason.trim() || null)
    setDelta(0)
    setReason('')
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2 className="drawer-title">Admin Controls</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close admin"
          >
            ✕
          </button>
        </div>

        <div className="drawer-body">
          <section className="drawer-section">
            <div className="drawer-section-title">Admin Key</div>
            <div className="drawer-section-body">
              <form onSubmit={handleSaveKey} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="drawer-row">
                  <label htmlFor="admin-key">Key</label>
                  <input
                    id="admin-key"
                    className="input"
                    type="password"
                    autoComplete="off"
                    placeholder="Commissioner key"
                    value={keyDraft}
                    onChange={e => setKeyDraft(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary">
                  {keySaved ? 'Saved ✓' : 'Save key'}
                </button>
              </form>
              <p className="drawer-help">
                Needed once for scoring, status changes, and overrides to write to the
                shared database. Stored for this browser tab only.
              </p>
            </div>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-title">Player Status</div>
            <div className="drawer-section-body">
              <div className="drawer-row">
                <label htmlFor="admin-status-player">Player</label>
                <select
                  id="admin-status-player"
                  className="select"
                  value={selectedPlayerId}
                  onChange={e => setSelectedPlayerId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  {players.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              {selectedPlayer && (
                <div className="status-picker">
                  {STATUSES.map(s => {
                    const current = selectedPlayer.status ?? 'active'
                    const active = current === s
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`status-btn${active ? ' is-active' : ''}`}
                        onClick={() => onPlayerStatusChange(selectedPlayer.id, s)}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    )
                  })}
                </div>
              )}
              <p className="drawer-help">
                Sets the castaway's game state. Anything other than <em>Active</em> or <em>Winner</em>
                counts them as voted-out for scoring purposes.
              </p>
            </div>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-title">Score Override</div>
            <div className="drawer-section-body">
              <form onSubmit={handleOverrideSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="drawer-row">
                  <label htmlFor="admin-override-player">Player</label>
                  <select
                    id="admin-override-player"
                    className="select"
                    value={selectedPlayerId}
                    onChange={e => setSelectedPlayerId(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    {players.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="drawer-row">
                  <label htmlFor="admin-override-episode">Episode</label>
                  <input
                    id="admin-override-episode"
                    className="input"
                    type="number"
                    min={1}
                    value={episode}
                    onChange={e => setEpisode(parseInt(e.target.value, 10) || 1)}
                  />
                </div>
                <div className="drawer-row">
                  <label htmlFor="admin-override-delta">Delta</label>
                  <input
                    id="admin-override-delta"
                    className="input"
                    type="number"
                    value={delta}
                    onChange={e => setDelta(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="drawer-row">
                  <label htmlFor="admin-override-reason">Reason</label>
                  <input
                    id="admin-override-reason"
                    className="input"
                    type="text"
                    placeholder="Optional note"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={selectedPlayerId === ''}>
                  Apply override
                </button>
                <p className="drawer-help">
                  Adds <strong>Delta</strong> points for the given episode. Set Delta to 0 to remove
                  an existing override.
                </p>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default AdminDrawer


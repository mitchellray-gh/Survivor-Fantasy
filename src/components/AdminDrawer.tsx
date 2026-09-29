import { PlayerStatus } from '../data/storage'
import { Player } from '../data/players'

interface AdminDrawerProps {
  isOpen: boolean
  onClose: () => void
  players: Player[]
  onPlayerStatusChange: (playerId: number, status: PlayerStatus) => void
  onOverrideChange: (playerId: number, episode: number, delta: number, reason: string | null) => void
}

export function AdminDrawer({ isOpen, onClose, players, onPlayerStatusChange, onOverrideChange }: AdminDrawerProps) {
  if (!isOpen) return null

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2 className="drawer-title">Admin Controls</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <div className="drawer-body">
          {players.map(player => (
            <div key={player.id} className="drawer-section">
              <h3 className="drawer-section-title">{player.name}</h3>
              <div className="drawer-section-body">
                <div className="drawer-row">
                  <label>Status</label>
                  <select 
                    className="select"
                    value={player.status}
                    onChange={(e) => onPlayerStatusChange(player.id, e.target.value as PlayerStatus)}
                  >
                    <option value="active">Active</option>
                    <option value="voted_out">Voted Out</option>
                    <option value="medevac">Medevac</option>
                    <option value="quit">Quit</option>
                    <option value="winner">Winner</option>
                  </select>
                </div>
                
                <div className="drawer-row">
                  <label>Score Override</label>
                  <input 
                    type="number" 
                    className="input"
                    placeholder="Override points"
                    defaultValue={0}
                    onChange={(e) => {
                      const delta = parseInt(e.target.value) || 0
                      onOverrideChange(player.id, 1, delta, 'Admin override')
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
import { PLAYERS, type Player } from './players'
import { PLAYER_TRIBES, TRIBES, type Tribe, type TribeId } from './tribes'
import { payoutFor } from './predictions'
import { reportFailedWrite } from './storage'
import {
  SCORING_CATEGORIES,
  type ScoringCategory,
  type ScoringCategoryId,
} from './scoringRules'
import {
  createBackend,
  type PlayerStatus,
  type StateEvent,
  type StateOverride,
  type StatePrediction,
  type StorageBackend,
} from './storage'

export type { Player, ScoringCategory, ScoringCategoryId, PlayerStatus }

export interface PlayerDetail {
  player: Player
  managerName: string
  total: number
  episodes: Array<{
    episode: number
    delta: number
    /** Running season total through the end of this episode. */
    total: number
    breakdown: Array<{
      categoryId: ScoringCategoryId
      label: string
      group: string
      count: number
      points: number
    }>
  }>
  best: { episode: number; delta: number }
}

export interface Manager {
  name: string
  players: Player[]
}

export interface ManagerStats {
  name: string
  total: number
  /** 1-based position on the leaderboard. */
  rank: number
  /** How many managers share this total (including self). >1 means a tie. */
  tied: number
  of: number
  rosterSize: number
  alive: number
  /** Roster members who have scored at least one point. */
  scored: number
  players: Array<{ player: Player; total: number }>
  tribeClashes: Array<{ tribe: Tribe; rivals: Player[] }>
}

/**
 * PlayerService is the single source of truth for the UI. It merges:
 *
 *   1. Static roster from src/data/players.ts (name, photo, occupation, ...)
 *   2. Mutable state from the backend (status, events, overrides, predictions,
 *      and optional server-side manager reassignments).
 *
 * All mutations are optimistic: we update the in-memory copy synchronously so
 * the UI re-renders immediately, then fire an async POST. Failures are logged
 * (last-write-wins - no more version conflicts, no more rollbacks).
 */
export class PlayerService {
  private players: Player[]
  private events: StateEvent[] = []
  private overrides: StateOverride[] = []
  private predictions: StatePrediction[] = []
  private meta: Record<string, string> = {}

  constructor(private readonly backend: StorageBackend = createBackend()) {
    // Deep-copy the static roster; votedOut kept as a convenience field the
    // rest of the app already reads. Tribe is stamped on here so both
    // hydrate() branches (remote and local) inherit it for free.
    this.players = PLAYERS.map(p => ({ ...p, votedOut: false, tribe: PLAYER_TRIBES[p.id] }))
  }

  /** Load persisted state and merge it onto the static roster. */
  async hydrate(): Promise<void> {
    try {
      const snap = await this.backend.load()

      if (snap.players.length > 0) {
        // Server players (if present) win over static fields, so an admin can
        // rename or reassign someone through the API and see it reflected.
        const byId = new Map(snap.players.map(p => [p.id, p]))
        this.players = PLAYERS.map(base => {
          const remote = byId.get(base.id)
          if (!remote) return { ...base, votedOut: false }
          return {
            ...base,
            name:        remote.name        || base.name,
            age:         remote.age        ?? base.age,
            hometown:    remote.hometown   ?? base.hometown,
            residence:   remote.residence  ?? base.residence,
            occupation:  remote.occupation ?? base.occupation,
            aboutMe:     remote.aboutMe    ?? base.aboutMe,
            photo:       remote.photo      ?? base.photo,
            managerName: remote.managerName ?? base.managerName,
            // Re-stamped: this branch rebuilds from PLAYERS, not from the
            // constructor's copy, so the tribe would otherwise be lost. The
            // server value wins when present so a commissioner reassignment
            // made via the API is reflected.
            tribe:      (remote.tribeId as TribeId | null | undefined) ?? PLAYER_TRIBES[base.id],
            status:      remote.status,
            votedOut:    remote.status !== 'active' && remote.status !== 'winner',
          }
        })
      } else {
        // Local-only: apply status overlay from placeholder rows the local
        // backend wrote (if any).
        const byId = new Map(snap.players.map(p => [p.id, p]))
        for (const p of this.players) {
          const overlay = byId.get(p.id)
          const status: PlayerStatus = overlay?.status ?? 'active'
          p.status = status
          p.votedOut = status !== 'active' && status !== 'winner'
          if (overlay?.managerName != null) p.managerName = overlay.managerName
        }
      }

      this.events      = snap.events
      this.overrides   = snap.overrides
      this.predictions = snap.predictions
      this.meta        = snap.meta
    } catch (err) {
      console.error('[PlayerService] hydrate failed:', err)
    }
  }

  /** True when the app is talking to a shared server, false for local-only. */
  isRemote(): boolean { return this.backend.kind === 'remote' }

  // -------- Roster / manager queries -----------------------------------------

  getPlayers(): Player[] { return this.players }
  getPlayerById(id: number): Player | undefined { return this.players.find(p => p.id === id) }

  /** Raw scored events. The recap reads these to build its digest. */
  getEvents(): StateEvent[] { return this.events }

  /** Tribe definitions in display order. */
  getTribes(): Tribe[] { return TRIBES }

  /**
   * Players grouped by tribe, in TRIBES order. Castaways with no tribe are
   * skipped rather than dumped into a catch-all bucket, so the board always
   * shows exactly the real three-way split.
   */
  getPlayersByTribe(): Array<{ tribe: Tribe; players: Player[] }> {
    return TRIBES.map(t => ({
      tribe: t,
      players: this.players.filter(p => p.tribe === t.id),
    }))
  }

  getManagers(): Manager[] {
    const byName = new Map<string, Player[]>()
    for (const p of this.players) {
      if (!p.managerName) continue
      if (!byName.has(p.managerName)) byName.set(p.managerName, [])
      byName.get(p.managerName)!.push(p)
    }
    return Array.from(byName.entries())
      .map(([name, players]) => ({ name, players }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  getScoringCategories(): ScoringCategory[] { return SCORING_CATEGORIES }
  getMeta(key: string): string | undefined { return this.meta[key] }

  // -------- Points math ------------------------------------------------------

  /** Points for one player in one episode: sum of (event.count * category.points) + override. */
  getPlayerEpisodeTotal(playerId: number, episode: number): number {
    let total = 0
    for (const cat of SCORING_CATEGORIES) {
      total += this.getEventValue(playerId, episode, cat.id) * cat.points
    }
    total += this.getOverride(playerId, episode)
    return total
  }

  /** Sum of a player's points across every episode we have data for. */
  getPlayerTotal(playerId: number): number {
    const episodes = new Set<number>()
    for (const e of this.events)    if (e.playerId === playerId) episodes.add(e.episode)
    for (const o of this.overrides) if (o.playerId === playerId) episodes.add(o.episode)
    let total = 0
    for (const ep of episodes) total += this.getPlayerEpisodeTotal(playerId, ep)
    return total
  }

  /** Sum across an entire manager's roster. */
  getManagerTotal(managerName: string): number {
    return this.players
      .filter(p => p.managerName === managerName)
      .reduce((sum, p) => sum + this.getPlayerTotal(p.id), 0)
  }

  /**
   * Everything the "My League" panel needs for one manager. Computed in one
   * pass so the panel does not have to re-derive standings math in the view.
   */
  getManagerStats(managerName: string): ManagerStats {
    const roster = this.players.filter(p => p.managerName === managerName)
    const totals = this.getManagerTotals()

    // Rank is 1-based, best total first. Ties share the same rank.
    const sorted = [...totals].sort((a, b) => b.total - a.total)
    const rank = sorted.findIndex(m => m.name === managerName) + 1
    const tied = sorted.filter(m => m.total === totals.find(t => t.name === managerName)?.total).length

    const players = roster
      .map(p => ({ player: p, total: this.getPlayerTotal(p.id) }))
      .sort((a, b) => b.total - a.total || a.player.name.localeCompare(b.player.name))

    const scored = players.filter(x => x.total !== 0).length

    return {
      name: managerName,
      total: totals.find(t => t.name === managerName)?.total ?? 0,
      rank,
      tied,
      of: totals.length,
      rosterSize: roster.length,
      alive: roster.filter(p => !p.votedOut).length,
      scored,
      players,
      // Of each manager's drafted castaways, how many share a tribe with a
      // rival's pick. Tribal overlap is the strategic cost of a draft.
      tribeClashes: this.getTribeClashes(managerName),
    }
  }

  /** Leaderboard of every manager, best total first. */
  getManagerTotals(): Array<{ name: string; total: number; players: Player[] }> {
    return this.getManagers().map(m => ({
      name: m.name,
      total: this.getManagerTotal(m.name),
      players: m.players,
    }))
  }

  /**
   * Opposing-manager castaways drafted onto the same tribe as this manager's
   * picks. These are the dangerous ones: they compete for the same immunity
   * and the same Tribal Council votes.
   */
  getTribeClashes(managerName: string): Array<{ tribe: Tribe; rivals: Player[] }> {
    const mine = new Set(
      this.players.filter(p => p.managerName === managerName).map(p => p.tribe),
    )
    return TRIBES
      .filter(t => mine.has(t.id))
      .map(t => ({
        tribe: t,
        rivals: this.players.filter(p => p.tribe === t.id && p.managerName !== managerName),
      }))
      .filter(g => g.rivals.length > 0)
  }

  // -------- Events (per-episode scoring) -------------------------------------

  getEventValue(playerId: number, episode: number, categoryId: ScoringCategoryId): number {
    const row = this.events.find(e =>
      e.playerId === playerId && e.episode === episode && e.categoryId === categoryId
    )
    return row?.count ?? 0
  }

  setEventCount(playerId: number, episode: number, categoryId: ScoringCategoryId, count: number): void {
    const clamped = Math.max(0, Math.floor(count))
    this.events = this.events.filter(e =>
      !(e.playerId === playerId && e.episode === episode && e.categoryId === categoryId)
    )
    if (clamped > 0) this.events.push({ playerId, episode, categoryId, count: clamped })
    void this.backend.setEvent({ playerId, episode, categoryId, count: clamped })
      .catch(err => reportFailedWrite(
        'Save score',
        err,
        () => this.backend.setEvent({ playerId, episode, categoryId, count: clamped }),
      ))
  }

  /** Convenience: booleans still use 0/1. */
  toggleEvent(playerId: number, episode: number, categoryId: ScoringCategoryId): void {
    const cur = this.getEventValue(playerId, episode, categoryId)
    this.setEventCount(playerId, episode, categoryId, cur > 0 ? 0 : 1)
  }

  // -------- Player status ----------------------------------------------------

  setPlayerStatus(playerId: number, status: PlayerStatus): void {
    const p = this.getPlayerById(playerId)
    if (!p) return
    p.status = status
    p.votedOut = status !== 'active' && status !== 'winner'
    void this.backend.setPlayerStatus(playerId, status)
      .catch(err => reportFailedWrite(
        'Save status',
        err,
        () => this.backend.setPlayerStatus(playerId, status),
      ))
  }

  /** Back-compat helpers used by existing screens. */
  voteOutPlayer(playerId: number):   void { this.setPlayerStatus(playerId, 'voted_out') }
  unvoteOutPlayer(playerId: number): void { this.setPlayerStatus(playerId, 'active') }

  setPlayerManager(playerId: number, managerName: string | null): void {
    const p = this.getPlayerById(playerId)
    if (!p) return
    p.managerName = managerName ?? ''
    void this.backend.setPlayerManager(playerId, managerName)
      .catch(err => console.error('[PlayerService] setPlayerManager failed:', err))
  }

  // -------- Commissioner overrides ------------------------------------------

  getOverride(playerId: number, episode: number): number {
    return this.overrides.find(o => o.playerId === playerId && o.episode === episode)?.delta ?? 0
  }

  setOverride(playerId: number, episode: number, delta: number, reason: string | null = null): void {
    this.overrides = this.overrides.filter(o => !(o.playerId === playerId && o.episode === episode))
    if (delta !== 0) this.overrides.push({ playerId, episode, delta, reason })
    void this.backend.setOverride({ playerId, episode, delta, reason })
      .catch(err => reportFailedWrite(
        'Save override',
        err,
        () => this.backend.setOverride({ playerId, episode, delta, reason }),
      ))
  }

  // -------- Recap ------------------------------------------------------------

  /** Every episode we have any scored data for, oldest first. */
  getScoredEpisodes(): number[] {
    const eps = new Set<number>()
    for (const e of this.events) if (e.count > 0) eps.add(e.episode)
    for (const o of this.overrides) eps.add(o.episode)
    return [...eps].sort((a, b) => a - b)
  }

  /** Per-episode point swings for one player across the whole season. */
  getPlayerEpisodeHistory(playerId: number): Array<{ episode: number; delta: number }> {
    return this.getScoredEpisodes()
      .map(episode => ({ episode, delta: this.getPlayerEpisodeTotal(playerId, episode) }))
      .filter(h => h.delta !== 0)
  }

  /**
   * The full story for one castaway: season total, every episode's swing
   * (including silent weeks so gaps are visible), and a running total. Backs
   * the player detail sheet, which is reachable from anywhere in the UI.
   */
  getPlayerDetail(playerId: number): PlayerDetail | null {
    const player = this.getPlayerById(playerId)
    if (!player) return null

    // Every episode we know about, so a quiet week shows as a flat entry
    // rather than vanishing and making the trend look smoother than it was.
    const episodes = this.getScoredEpisodes()
    let running = 0
    const rows: PlayerDetail['episodes'] = episodes.map(episode => {
      const delta = this.getPlayerEpisodeTotal(playerId, episode)
      // Break the episode down into the events that produced the points.
      const breakdown = SCORING_CATEGORIES
        .filter(cat => this.getEventValue(playerId, episode, cat.id) > 0)
        .map(cat => ({
          categoryId: cat.id,
          label: cat.label,
          group: cat.group,
          count: this.getEventValue(playerId, episode, cat.id),
          points: cat.points * this.getEventValue(playerId, episode, cat.id),
        }))
      const override = this.getOverride(playerId, episode)
      if (override !== 0) {
        breakdown.push({
          categoryId: 'medical_evac' as ScoringCategoryId,
          label: 'Commissioner adjustment',
          group: 'Advantage',
          count: 1,
          points: override,
        })
      }
      running += delta
      return { episode, delta, total: running, breakdown }
    })

    return {
      player,
      total: this.getPlayerTotal(playerId),
      episodes: rows,
      best: rows.reduce((m, r) => (r.delta > m.delta ? r : m), rows[0] ?? { episode: 0, delta: 0, total: 0, breakdown: [] }),
      managerName: player.managerName,
    }
  }

  /**
   * Commissioner's free-text note for an episode, stored in the meta bag so it
   * needs no schema change. Used for near-misses that earn no points.
   */
  getRecapNote(episode: number): string {
    return this.meta[`recap_note_ep${episode}`] ?? ''
  }

  setRecapNote(episode: number, note: string): void {
    this.meta = { ...this.meta, [`recap_note_ep${episode}`]: note }
    void this.backend.setMeta(`recap_note_ep${episode}`, note)
      .catch(err => reportFailedWrite(
        'Save note',
        err,
        () => this.backend.setMeta(`recap_note_ep${episode}`, note),
      ))
  }

  // -------- Season settings ---------------------------------------------------

  /**
   * The episode the league is currently on. Every tab defaults to this, so
   * advancing the season is one action rather than four separate edits.
   * Falls back to 1 before the commissioner has ever set it.
   */
  getCurrentEpisode(): number {
    const n = Number(this.meta.current_episode)
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
  }

  setCurrentEpisode(n: number): void {
    const ep = Math.max(1, Math.floor(n))
    this.meta = { ...this.meta, current_episode: String(ep) }
    void this.backend.setMeta('current_episode', String(ep))
      .catch(err => reportFailedWrite(
        'Set episode',
        err,
        () => this.backend.setMeta('current_episode', String(ep)),
      ))
  }

  /** True when predictions are closed to new picks. */
  isPredictionsLocked(): boolean {
    return this.meta.predictions_locked === 'true'
  }

  setPredictionsLocked(locked: boolean): void {
    this.meta = { ...this.meta, predictions_locked: locked ? 'true' : 'false' }
    void this.backend.setMeta('predictions_locked', locked ? 'true' : 'false')
      .catch(err => reportFailedWrite(
        'Update settings',
        err,
        () => this.backend.setMeta('predictions_locked', locked ? 'true' : 'false'),
      ))
  }

  // -------- Predictions ------------------------------------------------------

  getPrediction(manager: string, episode: number, categoryId: ScoringCategoryId): number | null {
    return this.predictions.find(p =>
      p.manager === manager && p.episode === episode && p.categoryId === categoryId
    )?.targetPlayerId ?? null
  }

  /** Full row for a manager's pick in one market, or null. */
  getPredictionRow(manager: string, episode: number, categoryId: ScoringCategoryId): StatePrediction | null {
    return this.predictions.find(p =>
      p.manager === manager && p.episode === episode && p.categoryId === categoryId
    ) ?? null
  }

  setPrediction(
    manager: string,
    episode: number,
    categoryId: ScoringCategoryId,
    targetPlayerId: number | null,
    stake = 0,
  ): void {
    this.predictions = this.predictions.filter(p =>
      !(p.manager === manager && p.episode === episode && p.categoryId === categoryId)
    )
    if (targetPlayerId !== null) {
      this.predictions.push({ manager, episode, categoryId, targetPlayerId, locked: false, stake })
    }
    void this.backend.setPrediction({ manager, episode, categoryId, targetPlayerId, locked: false, stake })
      .catch(err => reportFailedWrite(
        'Place bet',
        err,
        () => this.backend.setPrediction({ manager, episode, categoryId, targetPlayerId, locked: false, stake }),
      ))
  }

  /**
   * Settle one market for an episode against the commissioner's scoring.
   *
   * A pick is a HIT when the recorded event for that category belongs to the
   * predicted player. Returns null when the episode has no scored event for
   * that market yet - we cannot call a miss on an unscored week.
   */
  settleMarket(episode: number, categoryId: ScoringCategoryId): { winnerId: number | null; settled: boolean } {
    const winners = this.events
      .filter(e => e.episode === episode && e.categoryId === categoryId && e.count > 0)
      .map(e => e.playerId)
    return { winnerId: winners[0] ?? null, settled: winners.length > 0 }
  }

  /** A manager's ticket for one episode, enriched with settlement state. */
  getTicket(
    manager: string,
    episode: number,
    categoryId: ScoringCategoryId,
  ): {
    targetPlayerId: number | null
    stake: number
    result: 'hit' | 'miss' | 'open'
    payout: number
    winnerId: number | null
  } | null {
    const row = this.getPredictionRow(manager, episode, categoryId)
    if (!row || row.targetPlayerId === null) return null

    const stake = row.stake ?? 0
    const { winnerId, settled } = this.settleMarket(episode, categoryId)

    if (!settled) return { targetPlayerId: row.targetPlayerId, stake, result: 'open', payout: 0, winnerId: null }

    const hit = winnerId !== null && winnerId === row.targetPlayerId
    return {
      targetPlayerId: row.targetPlayerId,
      stake,
      result: hit ? 'hit' : 'miss',
      payout: hit ? payoutFor(categoryId, stake) : 0,
      winnerId,
    }
  }

  /** Chips deployed by a manager on one episode. */
  getStaked(manager: string, episode: number): number {
    return this.predictions
      .filter(p => p.manager === manager && p.episode === episode)
      .reduce((sum, p) => sum + (p.stake ?? 0), 0)
  }

  /**
   * Ledger for one manager and episode: what was staked, what came back, and
   * the net. Chips are a side game and never touch the league scoreboard.
   *
   * `net` deliberately EXCLUDES open (unsettled) stakes. An unscored episode
   * is a pending bet, not a loss, and counting it as one would show a manager
   * down chips they have not actually lost yet.
   */
  getLedger(manager: string, episode: number): {
    staked: number
    settledStaked: number
    returned: number
    net: number
    open: number
  } {
    const rows = this.predictions.filter(p => p.manager === manager && p.episode === episode)
    let staked = 0, settledStaked = 0, returned = 0, open = 0
    for (const row of rows) {
      const stake = row.stake ?? 0
      staked += stake
      const cat = row.categoryId as ScoringCategoryId
      const { winnerId, settled } = this.settleMarket(episode, cat)
      if (!settled) { open += stake; continue }
      settledStaked += stake
      if (winnerId !== null && winnerId === row.targetPlayerId) returned += payoutFor(cat, stake)
    }
    return { staked, settledStaked, returned, net: returned - settledStaked, open }
  }

  /** Season-to-date chip P&L for a manager. */
  getChipBalance(manager: string): number {
    const episodes = new Set(this.predictions.filter(p => p.manager === manager).map(p => p.episode))
    let bal = 0
    for (const ep of episodes) bal += this.getLedger(manager, ep).net
    return bal
  }

  /** Chip leaderboard, best first. */
  getChipStandings(): Array<{ manager: string; balance: number }> {
    return this.getManagers()
      .map(m => ({ manager: m.name, balance: this.getChipBalance(m.name) }))
      .sort((a, b) => b.balance - a.balance || a.manager.localeCompare(b.manager))
  }
}


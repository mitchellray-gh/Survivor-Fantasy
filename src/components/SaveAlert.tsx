import React from 'react'
import {
  clearFailedWrite, retryFailedWrite, type FailedWrite,
} from '../data/storage'

interface SaveAlertProps {
  failures: FailedWrite[]
  /** Pull fresh state so the UI stops showing a change that never saved. */
  onResync: () => void
}

/**
 * Persistent banner for failed writes.
 *
 * Optimistic updates mean a failed POST leaves the UI showing a change that
 * never reached the server. Rather than a transient toast that scrolls away
 * (which is easy to miss mid-scoring), this stays put until resolved and
 * offers a one-tap retry.
 */
const SaveAlert: React.FC<SaveAlertProps> = ({ failures, onResync }) => {
  if (failures.length === 0) return null

  const newest = failures[0]
  const isAuth = /401|Unauthorized|admin key/i.test(newest.message)

  return (
    <div className="save-alert" role="alert" aria-live="assertive">
      <div className="save-alert-icon" aria-hidden="true">!</div>
      <div className="save-alert-body">
        <div className="save-alert-title">
          {failures.length === 1
            ? `${newest.label} did not save`
            : `${failures.length} changes did not save`}
        </div>
        <div className="save-alert-msg">
          {isAuth
            ? 'Your admin key is missing or wrong. Open the gear menu and re-enter it.'
            : newest.message}
        </div>
        {failures.length > 1 && (
          <div className="save-alert-more">+{failures.length - 1} more</div>
        )}
      </div>
      <div className="save-alert-actions">
        {newest.retry && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => { retryFailedWrite(newest.id); onResync() }}
          >
            Retry
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => { clearFailedWrite(); onResync() }}
        >
          Discard
        </button>
      </div>
    </div>
  )
}

export default SaveAlert

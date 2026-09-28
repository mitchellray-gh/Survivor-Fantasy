import React, { useEffect } from 'react'

interface ToastProps {
  message: string
  kind?: 'success' | 'error' | 'info'
  onDone: () => void
  /** Auto-dismiss delay in ms. Default 2500. */
  duration?: number
}

/**
 * Tiny transient message pinned above the tab bar. Rendered by the App
 * whenever admin mutations succeed/fail. Auto-dismisses itself.
 */
const Toast: React.FC<ToastProps> = ({ message, kind = 'info', onDone, duration = 2500 }) => {
  useEffect(() => {
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [message, duration, onDone])

  return <div className={`toast ${kind}`} role="status" aria-live="polite">{message}</div>
}

export default Toast

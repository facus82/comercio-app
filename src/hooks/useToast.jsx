import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

let _nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((msg, type = 'info', duration = 3500) => {
    const id = _nextId++
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  const dismiss = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = {
    success: (msg, d) => push(msg, 'success', d),
    error:   (msg, d) => push(msg, 'error',   d ?? 5000),
    info:    (msg, d) => push(msg, 'info',    d),
    warning: (msg, d) => push(msg, 'warning', d),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

const ICONS = {
  success: 'ti-circle-check',
  error:   'ti-alert-circle',
  warning: 'ti-alert-triangle',
  info:    'ti-info-circle',
}

function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <i className={`ti ${ICONS[t.type]} toast-icon`} />
          <span className="toast-msg">{t.msg}</span>
          <button className="toast-close" onClick={() => onDismiss(t.id)}>
            <i className="ti ti-x" />
          </button>
        </div>
      ))}
    </div>
  )
}

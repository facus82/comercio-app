import { useState, useEffect, useCallback } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { ToastProvider } from '../../hooks/useToast.jsx'
import Ventas from './Ventas'
import './PosCaja.css'

const fmt$ = v =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v || 0)

const puedeFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

/* ── Mantener la pantalla encendida mientras el modo caja está abierto ── */
function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock = null
    const pedir = async () => {
      try { lock = await navigator.wakeLock.request('screen') } catch { /* sin permiso: se ignora */ }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') pedir() }
    pedir()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [])
}

export default function PosCaja() {
  const { session, perfil, loading } = useAuth()
  if (loading) {
    return <div className="app-loading"><div className="app-loading-spinner" /></div>
  }
  if (!session) return <Navigate to="/login" replace />
  if (perfil?.rol === 'superadmin') return <Navigate to="/superadmin" replace />

  return (
    <ToastProvider>
      <PosCajaContenido perfil={perfil} />
    </ToastProvider>
  )
}

function PosCajaContenido({ perfil }) {
  const navigate   = useNavigate()
  const comercioId = perfil?.comercio?.id
  useWakeLock()

  const [caja,        setCaja]        = useState(undefined)   // undefined = cargando, null = cerrada
  const [stats,       setStats]       = useState({ cant: 0, total: 0 })
  const [fullscreen,  setFullscreen]  = useState(false)
  const [verAtajos,   setVerAtajos]   = useState(false)

  /* Caja abierta del comercio */
  useEffect(() => {
    if (!comercioId) return
    supabase.from('cierres_caja')
      .select('*')
      .eq('comercio_id', comercioId)
      .eq('estado', 'abierta')
      .order('fecha_apertura', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setCaja(data || null))
  }, [comercioId])

  /* Ventas desde la apertura de la caja */
  const cargarStats = useCallback(async () => {
    if (!caja) return
    const { data } = await supabase.from('ventas')
      .select('total')
      .eq('comercio_id', comercioId)
      .eq('estado', 'completada')
      .gte('fecha', caja.fecha_apertura)
    setStats({ cant: (data || []).length, total: (data || []).reduce((s, v) => s + Number(v.total), 0) })
  }, [caja, comercioId])

  useEffect(() => { cargarStats() }, [cargarStats])

  /* Pantalla completa */
  useEffect(() => {
    const fn = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  function salir(destino) {
    if (document.fullscreenElement) document.exitFullscreen?.()
    navigate(destino)
  }

  /* ── Cargando ── */
  if (caja === undefined) {
    return <div className="app-loading"><div className="app-loading-spinner" /></div>
  }

  /* ── Caja cerrada: se abre en el módulo Caja (arqueo + referencia del último cierre) y vuelve ── */
  if (caja === null) {
    return <Navigate to="/caja?volver=pos" replace />
  }

  /* ── Modo caja ── */
  const apertura = new Date(caja.fecha_apertura).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="posc-page">
      <header className="posc-bar">
        <div className="posc-bar-marca">
          <span className="posc-bar-dot" />
          <div className="posc-bar-titulos">
            <strong>{perfil?.comercio?.nombre || 'Modo caja'}</strong>
            <span>{perfil?.nombre} · caja abierta {apertura}</span>
          </div>
        </div>

        <div className="posc-bar-stats" title="Ventas desde la apertura de la caja">
          <span className="posc-stat"><i className="ti ti-receipt" /> {stats.cant}</span>
          <span className="posc-stat posc-stat--total">{fmt$(stats.total)}</span>
        </div>

        <div className="posc-bar-acciones">
          <div className="posc-atajos-wrap">
            <button type="button" className="btn-icon posc-solo-desktop" title="Atajos de teclado" onClick={() => setVerAtajos(v => !v)}>
              <i className="ti ti-keyboard" />
            </button>
            {verAtajos && (
              <div className="posc-atajos" onMouseLeave={() => setVerAtajos(false)}>
                <p><kbd>F2</kbd> Cobrar</p>
                <p><kbd>F3</kbd> Buscar producto</p>
                <p><kbd>F4</kbd> Elegir cliente</p>
                <p><kbd>F6</kbd> Recargo</p>
                <p><kbd>F9</kbd> Vaciar venta</p>
              </div>
            )}
          </div>
          {puedeFullscreen && (
            <button type="button" className="btn-icon" onClick={toggleFullscreen} title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}>
              <i className={`ti ${fullscreen ? 'ti-arrows-minimize' : 'ti-arrows-maximize'}`} />
            </button>
          )}
          <button type="button" className="btn" onClick={() => salir('/ventas')} title="Volver a la app sin cerrar la caja">
            <i className="ti ti-logout-2" /><span className="posc-solo-desktop">Salir</span>
          </button>
          <button type="button" className="btn btn--danger" onClick={() => salir('/caja')} title="Ir al arqueo y cierre de caja">
            <i className="ti ti-lock" /><span className="posc-solo-desktop">Cerrar caja</span>
          </button>
        </div>
      </header>

      <main className="posc-main">
        <Ventas modoCaja onVentaRegistrada={cargarStats} />
      </main>
    </div>
  )
}

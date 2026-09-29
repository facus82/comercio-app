import { useEffect, useRef, useState } from 'react'
import './EscanerCodigo.css'

/* Lector de códigos de barras con la cámara.
   - Android/Chrome: BarcodeDetector nativo (rápido, sin librerías).
   - iPhone y otros: ZXing, que se descarga sólo al abrir el escáner.
   continuo=true → queda abierto y reporta cada código (POS: escanear varios productos);
   continuo=false → se cierra al primer código (ficha de producto). */

const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code']
const REPETIDO_MS = 1800   // ignora el mismo código leído dos veces seguidas

async function crearDetectorNativo() {
  if (!('BarcodeDetector' in window)) return null
  try {
    const soportados = await window.BarcodeDetector.getSupportedFormats()
    const formats = FORMATOS.filter(f => soportados.includes(f))
    if (!formats.includes('ean_13')) return null
    return new window.BarcodeDetector({ formats })
  } catch {
    return null
  }
}

function avisoLectura() {
  navigator.vibrate?.(60)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 1400
    gain.gain.value = 0.08
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.08)
    osc.onended = () => ctx.close()
  } catch { /* sin audio: sólo vibra */ }
}

export default function EscanerCodigo({ onLeer, onCerrar, continuo = false, titulo = 'Escanear código' }) {
  const videoRef   = useRef(null)
  const onLeerRef  = useRef(onLeer)
  const [estado,   setEstado]   = useState('iniciando')   // iniciando | leyendo | error
  const [error,    setError]    = useState('')
  const [ultimo,   setUltimo]   = useState(null)          // { codigo, ok, texto } del último leído
  const [linterna, setLinterna] = useState(null)          // null = no soportada

  useEffect(() => { onLeerRef.current = onLeer })

  useEffect(() => {
    let cancelado = false
    let stream = null
    let timer = null
    let zxingControls = null
    let previo = { codigo: null, t: 0 }

    function reportar(codigo) {
      const ahora = Date.now()
      if (codigo === previo.codigo && ahora - previo.t < REPETIDO_MS) return false
      previo = { codigo, t: ahora }
      avisoLectura()
      // onLeer puede devolver { ok, texto } para mostrar qué pasó con ese código
      const r = onLeerRef.current?.(codigo) || {}
      setUltimo({ codigo, ok: r.ok !== false, texto: r.texto })
      return true
    }

    async function iniciar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado('error'); setError('Este navegador no permite usar la cámara.'); return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch (e) {
        setEstado('error')
        setError(e?.name === 'NotAllowedError'
          ? 'No hay permiso para usar la cámara. Habilitalo en la configuración del navegador.'
          : 'No se pudo abrir la cámara.')
        return
      }
      if (cancelado) { stream.getTracks().forEach(t => t.stop()); return }

      const video = videoRef.current
      video.srcObject = stream
      await video.play().catch(() => {})

      // Linterna (sólo algunos Android)
      const track = stream.getVideoTracks()[0]
      if (track?.getCapabilities?.().torch) setLinterna(false)

      setEstado('leyendo')

      const nativo = await crearDetectorNativo()
      if (cancelado) return

      if (nativo) {
        const loop = async () => {
          if (cancelado) return
          try {
            const [r] = await nativo.detect(video)
            if (r?.rawValue && reportar(r.rawValue) && !continuo) return
          } catch { /* frame sin datos: seguir */ }
          timer = setTimeout(loop, 120)
        }
        loop()
        return
      }

      // Fallback: ZXing bajo demanda
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      if (cancelado) return
      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120 })
      zxingControls = await reader.decodeFromStream(stream, video, (result, _err, controls) => {
        if (!result) return
        if (reportar(result.getText()) && !continuo) controls.stop()
      })
    }

    iniciar()

    return () => {
      cancelado = true
      clearTimeout(timer)
      zxingControls?.stop()
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [continuo])

  // En modo único, cerrar apenas se leyó
  useEffect(() => {
    if (!continuo && ultimo) onCerrar()
  }, [continuo, ultimo, onCerrar])

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCerrar])

  async function toggleLinterna() {
    const track = videoRef.current?.srcObject?.getVideoTracks?.()[0]
    if (!track) return
    const nuevo = !linterna
    try { await track.applyConstraints({ advanced: [{ torch: nuevo }] }); setLinterna(nuevo) } catch { /* no soportado */ }
  }

  return (
    <div className="esc-overlay" onClick={onCerrar}>
      <div className="esc-modal" onClick={e => e.stopPropagation()}>
        <div className="esc-header">
          <span><i className="ti ti-barcode" /> {titulo}</span>
          <button type="button" className="btn-icon" onClick={onCerrar} title="Cerrar"><i className="ti ti-x" /></button>
        </div>

        <div className="esc-visor">
          <video ref={videoRef} playsInline muted />
          {estado === 'leyendo' && <div className="esc-marco"><span className="esc-laser" /></div>}
          {estado === 'iniciando' && <div className="esc-msg"><i className="ti ti-loader-2 esc-spin" /> Abriendo cámara…</div>}
          {estado === 'error' && <div className="esc-msg esc-msg--error"><i className="ti ti-camera-off" /> {error}</div>}
          {linterna !== null && (
            <button type="button" className={`esc-linterna${linterna ? ' esc-linterna--on' : ''}`} onClick={toggleLinterna} title="Linterna">
              <i className="ti ti-bulb" />
            </button>
          )}
        </div>

        <div className="esc-footer">
          {continuo && ultimo ? (
            <span className={`esc-ultimo${ultimo.ok ? '' : ' esc-ultimo--error'}`}>
              <i className={`ti ${ultimo.ok ? 'ti-circle-check' : 'ti-alert-circle'}`} />
              {ultimo.texto || <>Leído: <strong>{ultimo.codigo}</strong></>}
            </span>
          ) : (
            <span className="esc-ayuda">Apuntá al código de barras, a unos 15 cm.</span>
          )}
          {continuo && (
            <button type="button" className="btn btn--filled" onClick={onCerrar}>
              <i className="ti ti-check" /> Listo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

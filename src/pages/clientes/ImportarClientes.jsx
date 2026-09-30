import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import {
  autoDetectar, claveNombre, parseNumero, parseFecha, colLetra, leerArchivo, descargarPlantilla,
} from '../../lib/excel'
import { crearSaldoInicial, hoyISO, sumarDias } from '../../hooks/useCuentasCobrar'
import '../stock/ImportarExcel.css'

const CAMPOS = [
  { id: 'nombre',         label: 'Nombre',               required: true,  grupo: 'cliente' },
  { id: 'apellido',       label: 'Apellido',             grupo: 'cliente' },
  { id: 'razon_social',   label: 'Razón social',         grupo: 'cliente' },
  { id: 'dni',            label: 'DNI',                  grupo: 'cliente' },
  { id: 'cuit',           label: 'CUIT',                 grupo: 'cliente' },
  { id: 'telefono',       label: 'Teléfono',             grupo: 'cliente' },
  { id: 'email',          label: 'Email',                grupo: 'cliente' },
  { id: 'direccion',      label: 'Dirección',            grupo: 'cliente' },
  { id: 'localidad',      label: 'Localidad',            grupo: 'cliente' },
  { id: 'tipo',           label: 'Tipo',                 grupo: 'cliente' },
  { id: 'limite_credito', label: 'Límite de crédito',    grupo: 'cliente' },
  { id: 'plazo_dias',     label: 'Plazo (días)',         grupo: 'cliente' },
  { id: 'notas',          label: 'Notas',                grupo: 'cliente' },
  { id: 'saldo',          label: 'Saldo que debe',       grupo: 'saldo' },
  { id: 'fecha_saldo',    label: 'Fecha de la deuda',    grupo: 'saldo' },
  { id: 'vencimiento',    label: 'Vencimiento',          grupo: 'saldo' },
]

const SINONIMOS = {
  nombre:         ['nombre', 'name', 'cliente', 'nombre_y_apellido'],
  apellido:       ['apellido', 'surname', 'last_name'],
  razon_social:   ['razon_social', 'razon', 'empresa', 'fantasia'],
  dni:            ['dni', 'documento', 'doc', 'nro_doc'],
  cuit:           ['cuit', 'cuil'],
  telefono:       ['telefono', 'tel', 'celular', 'cel', 'whatsapp', 'movil', 'phone'],
  email:          ['email', 'mail', 'correo', 'e_mail'],
  direccion:      ['direccion', 'domicilio', 'calle', 'address'],
  localidad:      ['localidad', 'ciudad', 'barrio', 'city'],
  tipo:           ['tipo', 'categoria', 'condicion'],
  limite_credito: ['limite_credito', 'limite', 'credito'],
  plazo_dias:     ['plazo_dias', 'plazo', 'dias'],
  notas:          ['notas', 'nota', 'observaciones', 'obs', 'comentario'],
  saldo:          ['saldo', 'deuda', 'debe', 'saldo_inicial', 'adeudado', 'importe'],
  fecha_saldo:    ['fecha_saldo', 'fecha_deuda', 'fecha'],
  vencimiento:    ['vencimiento', 'vence', 'vto', 'fecha_vencimiento'],
}

// "Cta Cte", "cuenta corriente", "CC" → cuenta_corriente
function parseTipo(v) {
  const s = claveNombre(v).replace(/[^a-z]/g, '')
  if (!s) return null
  if (s.startsWith('mayor')) return 'mayorista'
  if (s === 'cc' || s.includes('cta') || s.includes('cuenta') || s.includes('corriente')) return 'cuenta_corriente'
  return 'consumidor_final'
}

// Sólo dígitos: "20-12345678-9" = "20123456789"
const soloDigitos = v => String(v ?? '').replace(/\D/g, '')
const nombreCompleto = c => claveNombre(c.razon_social || `${c.nombre} ${c.apellido || ''}`)

function plantillaClientes() {
  return descargarPlantilla([
    ['nombre', 'apellido', 'razon_social', 'dni', 'cuit', 'telefono', 'email', 'direccion', 'localidad', 'tipo', 'limite_credito', 'plazo_dias', 'saldo', 'fecha_saldo', 'vencimiento'],
    ['Juan', 'Pérez', '', '30123456', '', '3804123456', 'juan@mail.com', 'San Martín 123', 'La Rioja', 'Cta Cte', 50000, 30, 15300, '10/08/2026', '10/09/2026'],
    ['María', 'Gómez', '', '28987654', '', '3804654321', '', '', 'Chilecito', 'Cta Cte', 0, 15, 4200.5, '25/08/2026', ''],
    ['Kiosco El Sol', '', 'El Sol SRL', '', '30-71234567-8', '3804111222', '', 'Rivadavia 500', 'La Rioja', 'Mayorista', 200000, 30, '', '', ''],
  ], 'Clientes', 'plantilla_clientes.xlsx')
}

export default function ImportarClientes({ clientes, comercioId, usuarioId, onImportado, onCerrar }) {
  const fileRef = useRef(null)
  const [paso, setPaso]         = useState(1) // 1 upload · 2 mapeo · 3 resultado
  const [arrastrando, setArr]   = useState(false)
  const [headers, setHeaders]   = useState([])
  const [filas, setFilas]       = useState([])
  const [mapeo, setMapeo]       = useState({})
  const [importando, setImp]    = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [resultado, setResult]  = useState(null)

  const mapeado = campo => mapeo[campo] !== undefined

  // Resumen de saldos del archivo, para mostrar antes de importar
  const saldosArchivo = !mapeado('saldo') ? [] :
    filas.map(r => parseNumero(r[mapeo.saldo])).filter(n => n > 0)
  const totalSaldos = saldosArchivo.reduce((s, n) => s + n, 0)

  async function procesarArchivo(file) {
    if (!file) return
    try {
      const { headers: h, filas: f } = await leerArchivo(file)
      setHeaders(h)
      setFilas(f)
      // "fecha_vencimiento" tiene que ir a Vencimiento antes de que "fecha" lo tome como fecha de la deuda
      setMapeo(autoDetectar(h, [...CAMPOS].sort((a, b) => (b.id === 'vencimiento') - (a.id === 'vencimiento')), SINONIMOS))
      setPaso(2)
    } catch {
      alert('No se pudo leer el archivo. Verificá que sea .xlsx, .xls o .csv válido.')
    }
  }

  function handleDrop(e) {
    e.preventDefault(); setArr(false)
    procesarArchivo(e.dataTransfer.files[0])
  }

  async function confirmar() {
    if (!mapeado('nombre') && !mapeado('razon_social')) { alert('Asigná al menos la columna "Nombre".'); return }
    setImp(true)
    setProgreso(0)
    let creados = 0, actualizados = 0, saldosCargados = 0, montoSaldos = 0, saldosRepetidos = 0
    const errores = []
    const lista = [...clientes]

    // Saldos iniciales que ya existen: si se importa dos veces el mismo archivo no se duplican
    const { data: siPrevios } = await supabase
      .from('ventas')
      .select('cliente_id, fecha, cc_monto')
      .eq('comercio_id', comercioId)
      .eq('es_saldo_inicial', true)
      .neq('estado', 'anulada')
    const claveSI = (clienteId, fecha, monto) => `${clienteId}|${fecha}|${Number(monto).toFixed(2)}`
    const yaCargados = new Set((siPrevios || []).map(v => claveSI(
      v.cliente_id,
      new Date(v.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }),
      v.cc_monto,
    )))

    for (let n = 0; n < filas.length; n++) {
      const row = filas[n]
      setProgreso(n + 1)
      const val = campo => (mapeado(campo) ? String(row[mapeo[campo]] ?? '').trim() : '')
      const razon  = val('razon_social')
      const nombre = val('nombre') || razon
      const etiqueta = nombre || `Fila ${n + 2}`
      try {
        if (!nombre) continue

        const saldo = mapeado('saldo') ? +parseNumero(row[mapeo.saldo]).toFixed(2) : 0

        // Sólo las columnas asignadas y con dato: al actualizar no se borra lo que ya estaba
        const datos = { nombre }
        for (const campo of ['apellido', 'razon_social', 'telefono', 'email', 'direccion', 'localidad', 'notas']) {
          if (val(campo)) datos[campo] = val(campo)
        }
        if (val('dni'))  datos.dni  = soloDigitos(val('dni'))  || null
        if (val('cuit')) datos.cuit = val('cuit')
        if (val('limite_credito')) datos.limite_credito = parseNumero(val('limite_credito'))
        if (val('plazo_dias'))     datos.plazo_dias     = Math.round(parseNumero(val('plazo_dias'))) || 30
        const tipo = parseTipo(val('tipo'))
        if (tipo) datos.tipo = tipo
        if (saldo > 0 && (datos.tipo ?? 'consumidor_final') === 'consumidor_final') datos.tipo = 'cuenta_corriente'

        // Buscar cliente existente por CUIT, DNI o nombre
        const cuitDig = soloDigitos(datos.cuit)
        const existente =
          (cuitDig && lista.find(c => soloDigitos(c.cuit) === cuitDig)) ||
          (datos.dni && lista.find(c => soloDigitos(c.dni) === datos.dni)) ||
          lista.find(c => nombreCompleto(c) === nombreCompleto(datos))

        let cliente
        if (existente) {
          // Un cliente con Cta. Cte. o mayorista no pasa a consumidor final por el archivo
          if (datos.tipo === 'consumidor_final' || (datos.tipo === 'cuenta_corriente' && existente.tipo === 'mayorista')) delete datos.tipo
          const { data, error } = await supabase.from('clientes').update(datos).eq('id', existente.id).select().single()
          if (error) throw new Error(error.message)
          Object.assign(existente, data)
          cliente = existente
          actualizados++
        } else {
          const { data, error } = await supabase.from('clientes')
            .insert({ ...datos, comercio_id: comercioId }).select().single()
          if (error) throw new Error(error.message)
          lista.push(data)
          cliente = data
          creados++
        }

        if (saldo > 0) {
          const fecha = parseFecha(row[mapeo.fecha_saldo]) || hoyISO()
          const plazo = Number(cliente.plazo_dias) || 30
          const vencimiento = (mapeado('vencimiento') && parseFecha(row[mapeo.vencimiento]))
            || sumarDias(plazo, new Date(fecha + 'T12:00:00'))
          const clave = claveSI(cliente.id, fecha, saldo)
          if (yaCargados.has(clave)) { saldosRepetidos++; continue }
          const { error } = await crearSaldoInicial({
            comercioId, clienteId: cliente.id, usuarioId, monto: saldo, fecha, vencimiento,
            notas: 'Saldo inicial (importado)',
          })
          if (error) throw new Error(`Saldo: ${error.message}`)
          yaCargados.add(clave)
          saldosCargados++
          montoSaldos += saldo
        }
      } catch (err) {
        const msg = String(err.message || err)
        errores.push(`${etiqueta}: ${/duplicate key|unique/i.test(msg) ? 'DNI o CUIT repetido con otro cliente' : msg}`)
      }
    }

    setResult({ creados, actualizados, saldosCargados, montoSaldos, saldosRepetidos, errores })
    setPaso(3)
    setImp(false)
    onImportado?.()
  }

  const fmt$ = v => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(v || 0)

  // Columnas del select (vacío + cada encabezado)
  const opcionesCol = [
    <option key="" value="">— No importar —</option>,
    ...headers.map((h, i) => (
      <option key={i} value={i}>{colLetra(i)} — {h || `Columna ${i + 1}`}</option>
    )),
  ]

  const selectCampo = campo => (
    <div key={campo.id} className="field">
      <label className="field-label">
        {campo.label}
        {campo.required && <span style={{ color: 'var(--color-text-danger)' }}> *</span>}
      </label>
      <select
        className="field-select"
        value={mapeo[campo.id] ?? ''}
        onChange={e => {
          const v = e.target.value
          setMapeo(prev => ({ ...prev, [campo.id]: v === '' ? undefined : Number(v) }))
        }}
      >
        {opcionesCol}
      </select>
    </div>
  )

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCerrar()}>
      <div className="modal-xl">

        <div className="panel-header">
          <h2 className="panel-title">
            <i className="ti ti-file-spreadsheet" style={{ marginRight: 6, fontSize: 15 }} />
            Importar clientes desde Excel
          </h2>
          <button className="btn-icon" onClick={onCerrar}><i className="ti ti-x" /></button>
        </div>

        {/* Paso 1: Upload */}
        {paso === 1 && (
          <div className="modal-body">
            <div
              className={`drop-zone${arrastrando ? ' drop-zone--over' : ''}`}
              onDragOver={e => { e.preventDefault(); setArr(true) }}
              onDragLeave={() => setArr(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <i className="ti ti-cloud-upload drop-zone-icon" />
              <p className="drop-zone-title">Arrastrá tu archivo aquí</p>
              <p className="drop-zone-sub">o hacé click para seleccionar · .xlsx · .xls · .csv</p>
            </div>
            <input
              ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={e => procesarArchivo(e.target.files[0])}
            />
            <div className="import-hints">
              <div className="import-hint">
                <i className="ti ti-info-circle" />
                <span>La primera fila debe contener los encabezados de columna.</span>
              </div>
              <div className="import-hint import-hint--cols">
                <i className="ti ti-columns" />
                <span>
                  Columnas reconocidas:&nbsp;
                  <strong>nombre</strong>, <strong>apellido</strong>, <strong>razon_social</strong>,&nbsp;
                  <strong>dni</strong>, <strong>cuit</strong>, <strong>telefono</strong>, <strong>email</strong>,&nbsp;
                  <strong>direccion</strong>, <strong>localidad</strong>, <strong>tipo</strong>,&nbsp;
                  <strong>limite_credito</strong>, <strong>plazo_dias</strong>, <strong>notas</strong>
                </span>
              </div>
              <div className="import-hint import-hint--cols">
                <i className="ti ti-cash" />
                <span>
                  Para traer deudas del sistema anterior agregá <strong>saldo</strong> (lo que debe hoy),&nbsp;
                  <strong>fecha_saldo</strong> y <strong>vencimiento</strong>. Si un cliente tiene varias deudas
                  con fechas distintas, repetí la fila una vez por cada deuda.
                </span>
              </div>
              <button type="button" className="btn btn--primary" onClick={plantillaClientes}
                style={{ alignSelf: 'flex-start' }}>
                <i className="ti ti-download" />
                Descargar plantilla de ejemplo
              </button>
            </div>
          </div>
        )}

        {/* Paso 2: Mapeo */}
        {paso === 2 && (
          <div className="modal-body modal-body--scroll">
            <div className="preview-section">
              <p className="import-section-title">
                <i className="ti ti-table" /> Vista previa ({filas.length} filas)
              </p>
              <div className="preview-wrap">
                <table className="data-table preview-table">
                  <thead>
                    <tr>{headers.map((h, i) => <th key={i}>{colLetra(i)} — {h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filas.slice(0, 5).map((row, ri) => (
                      <tr key={ri}>
                        {headers.map((_, ci) => <td key={ci} className="td-muted">{String(row[ci] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mapeo-section">
              <p className="import-section-title">
                <i className="ti ti-arrows-transfer-down" /> Datos del cliente
              </p>
              <div className="mapeo-grid">
                {CAMPOS.filter(c => c.grupo === 'cliente').map(selectCampo)}
              </div>
            </div>

            <div className="mapeo-section">
              <p className="import-section-title">
                <i className="ti ti-cash" /> Saldo de cuenta corriente (opcional)
              </p>
              <div className="mapeo-grid">
                {CAMPOS.filter(c => c.grupo === 'saldo').map(selectCampo)}
              </div>
              <div className="import-hint" style={{ marginTop: 10 }}>
                <i className="ti ti-info-circle" />
                <span>
                  Cada saldo se carga como <strong>saldo inicial</strong> en la cuenta del cliente: después lo
                  cobrás como cualquier deuda. No descuenta stock, no entra en caja ni suma en los reportes de
                  ventas. Sin fecha se usa la de hoy; sin vencimiento, la fecha + el plazo del cliente (30 días).
                </span>
              </div>
              {saldosArchivo.length > 0 && (
                <div className="import-hint import-hint--cols" style={{ marginTop: 8 }}>
                  <i className="ti ti-calculator" />
                  <span>
                    El archivo trae <strong>{saldosArchivo.length} saldos</strong> por un total de{' '}
                    <strong>{fmt$(totalSaldos)}</strong>. Controlá que coincida con el sistema anterior.
                  </span>
                </div>
              )}
            </div>

            <div className="import-hint">
              <i className="ti ti-users" />
              <span>
                Si el cliente ya existe (mismo CUIT, DNI o nombre) se actualiza sólo con las columnas que tengan
                dato. Si importás dos veces el mismo archivo, los saldos no se duplican.
              </span>
            </div>
          </div>
        )}

        {/* Paso 3: Resultado */}
        {paso === 3 && resultado && (
          <div className="modal-body resultado-body">
            <div className="resultado-icon">
              <i className="ti ti-circle-check" style={{ color: 'var(--color-text-success)', fontSize: 40 }} />
            </div>
            <h3 className="resultado-titulo">Importación completada</h3>
            <div className="resultado-stats">
              <div className="resultado-stat resultado-stat--success">
                <i className="ti ti-plus" />
                <span><strong>{resultado.creados}</strong> clientes creados</span>
              </div>
              <div className="resultado-stat resultado-stat--info">
                <i className="ti ti-refresh" />
                <span><strong>{resultado.actualizados}</strong> clientes actualizados</span>
              </div>
              {resultado.saldosCargados > 0 && (
                <div className="resultado-stat resultado-stat--info">
                  <i className="ti ti-cash" />
                  <span><strong>{resultado.saldosCargados}</strong> saldos cargados · {fmt$(resultado.montoSaldos)}</span>
                </div>
              )}
              {resultado.saldosRepetidos > 0 && (
                <div className="resultado-stat resultado-stat--info">
                  <i className="ti ti-copy-off" />
                  <span><strong>{resultado.saldosRepetidos}</strong> saldos ya estaban cargados (no se duplicaron)</span>
                </div>
              )}
              {resultado.errores.length > 0 && (
                <div className="resultado-stat resultado-stat--danger">
                  <i className="ti ti-alert-circle" />
                  <span><strong>{resultado.errores.length}</strong> errores</span>
                </div>
              )}
            </div>
            {resultado.errores.length > 0 && (
              <div className="errores-list">
                <p className="field-label" style={{ marginBottom: 6 }}>Detalle de errores:</p>
                {resultado.errores.slice(0, 8).map((e, i) => <p key={i} className="error-row">{e}</p>)}
                {resultado.errores.length > 8 && (
                  <p className="td-muted" style={{ fontSize: 11 }}>...y {resultado.errores.length - 8} más</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="panel-footer">
          {paso === 1 && (
            <button className="btn" onClick={onCerrar}><i className="ti ti-x" /> Cancelar</button>
          )}
          {paso === 2 && (
            <>
              <button className="btn" onClick={() => setPaso(1)}>
                <i className="ti ti-arrow-left" /> Volver
              </button>
              <button className="btn btn--primary" onClick={confirmar} disabled={importando}>
                <i className={`ti ${importando ? 'ti-loader-2' : 'ti-file-import'}`} />
                {importando ? `Importando ${progreso} de ${filas.length}...` : `Importar ${filas.length} filas`}
              </button>
            </>
          )}
          {paso === 3 && (
            <button className="btn btn--primary" onClick={onCerrar}>
              <i className="ti ti-check" /> Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'

// Tema de la app: 'auto' (según el sistema), 'light' o 'dark'. Se recuerda por dispositivo.
// index.html aplica el valor guardado antes de pintar, para evitar el destello blanco.
const CLAVE = 'gestcom-tema'
const ORDEN = ['auto', 'light', 'dark']

function aplicar(tema) {
  const root = document.documentElement
  if (tema === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', tema)
}

export function useTema() {
  const [tema, setTema] = useState(() => {
    try { return localStorage.getItem(CLAVE) || 'auto' } catch { return 'auto' }
  })

  useEffect(() => {
    aplicar(tema)
    try { localStorage.setItem(CLAVE, tema) } catch { /* sin storage: sólo esta sesión */ }
  }, [tema])

  const siguiente = () => setTema(t => ORDEN[(ORDEN.indexOf(t) + 1) % ORDEN.length])
  return { tema, siguiente }
}

export const TEMA_INFO = {
  auto:  { icon: 'ti-device-desktop', label: 'Tema automático (según el dispositivo)' },
  light: { icon: 'ti-sun',            label: 'Tema claro' },
  dark:  { icon: 'ti-moon',           label: 'Tema oscuro' },
}

import './styles.css'

import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { IconContext } from '@phosphor-icons/react'
import App from './App'

// Todos los iconos de Phosphor en trazo fino ("light"), como de tiza; cada uno puede cambiarlo.
const icons = { size: 16, weight: 'light', color: 'currentColor' } as const

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IconContext.Provider value={icons}>
      <Suspense>
        <App />
      </Suspense>
    </IconContext.Provider>
  </StrictMode>
)

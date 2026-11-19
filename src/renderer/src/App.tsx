import { use } from 'react'
import { TerminalPane } from './components/TerminalPane'

// Fuera de React para que StrictMode no cree dos sesiones; al recargar reutiliza la que ya existe.
// ponytail: una sola sesión fija hasta que llegue la barra lateral en la fase 3.
const { sessions, home } = window.slate
const first = sessions.list().then(async (list) => list[0] ?? sessions.create(await home()))

function App(): React.JSX.Element {
  const session = use(first)
  return (
    <main className="h-full bg-canvas p-2">
      <TerminalPane sessionId={session.id} />
    </main>
  )
}

export default App

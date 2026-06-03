import { HashRouter, Routes, Route } from 'react-router-dom'
import { TitleBar } from './components/layout/TitleBar'
import { WelcomePage } from './routes/WelcomePage'
import { EditorPage } from './routes/EditorPage'
import { SettingsPage } from './routes/SettingsPage'

export default function App() {
  return (
    <HashRouter>
      <div className="h-screen flex flex-col bg-slate-50">
        <TitleBar />
        <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        </div>
      </div>
    </HashRouter>
  )
}

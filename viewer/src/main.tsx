import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { StartPage } from './pages/StartPage'
import { GamePage } from './pages/GamePage'
import { ExperimentsPage } from './pages/ExperimentsPage'
import './styles/theme.css'

document.documentElement.dataset.mood = 'night'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="sky stars" aria-hidden />
    <div className="sky moonglow" aria-hidden />
    <div className="sky sunglow" aria-hidden />
    <HashRouter>
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/experiments" element={<ExperimentsPage />} />
        <Route path="*" element={<StartPage />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans'
import './index.css'
import App from './App'
import { installViewportFix } from './lib/device'
import { initPwa } from './lib/pwa'
import { unlockAudioOnFirstGesture } from './lib/sound'

initPwa()
installViewportFix()
unlockAudioOnFirstGesture()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

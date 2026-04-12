import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'
import ProfilePage from './ProfilePage.jsx'
import ResetPasswordPage from './ResetPasswordPage.jsx'
import InvitePage from './InvitePage.jsx'
import FeedPage from './FeedPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:userId" element={<ProfilePage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/invite/:code" element={<InvitePage />} />
        <Route path="/feed" element={<FeedPage />} />
      </Routes>
      <Analytics />
    </BrowserRouter>
  </StrictMode>,
)
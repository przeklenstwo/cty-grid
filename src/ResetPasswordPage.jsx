import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)
  const [loading, setLoading]       = useState(false)
  const [validSession, setValidSession] = useState(false)

  useEffect(() => {
    // Sprawdź czy jest aktywna sesja resetowania
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setValidSession(true)
      else setError('Link resetowania wygasł lub jest nieprawidłowy. Wróć i spróbuj ponownie.')
    })
  }, [])

  async function handleReset() {
    setError('')
    if (password.length < 6) { setError('Hasło musi mieć min. 6 znaków'); return }
    if (password !== confirm) { setError('Hasła nie są identyczne'); return }
    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setError(updateError.message); setLoading(false); return }

    setSuccess(true)
    setTimeout(() => navigate('/'), 2500)
    setLoading(false)
  }

  const input = {
    width: '100%', padding: '13px 16px', borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.07)',
    color: 'white', fontSize: '0.92rem',
    fontFamily: 'Space Grotesk, sans-serif', outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#09090b',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', fontFamily: 'Space Grotesk, sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'rgba(12,12,14,0.97)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
        padding: '40px 36px',
        boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
      }}>
        <h1 style={{ color: 'white', fontWeight: 700, fontSize: '1.8rem', letterSpacing: '0.05em', margin: 0 }}>CTY-GRID</h1>
        <p style={{ color: '#52525b', fontSize: '0.85rem', marginTop: '6px', marginBottom: '28px' }}>
          Ustaw nowe hasło
        </p>

        {success ? (
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', textAlign: 'center' }}>
            ✅ Hasło zmienione! Przekierowuję...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              style={input} type="password" placeholder="Nowe hasło *"
              value={password} onChange={e => setPassword(e.target.value)}
            />
            <input
              style={input} type="password" placeholder="Powtórz hasło *"
              value={confirm} onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
            />
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '0.82rem' }}>
                {error}
              </div>
            )}
            <button
              onClick={handleReset}
              disabled={loading || !validSession}
              style={{
                marginTop: '4px', padding: '14px', borderRadius: '12px', border: 'none',
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                color: 'white', fontWeight: 700, fontSize: '0.95rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'Space Grotesk, sans-serif',
                boxShadow: '0 4px 20px rgba(249,115,22,0.35)',
                opacity: loading ? 0.7 : 1,
              }}
            >{loading ? '...' : 'Zmień hasło →'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

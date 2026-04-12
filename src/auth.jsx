import { useState } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from './supabaseClient'

export default function Auth({ onLogin }) {
  const [mode, setMode]         = useState('login') // login | register | reset
  const [identifier, setIdentifier] = useState('') // email lub username
  const [username, setUsername] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [discord, setDiscord]   = useState('')
  const [error, setError]       = useState('')
  const [info, setInfo]         = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleLogin() {
    setLoading(true); setError(''); setInfo('')

    let loginEmail = identifier.trim()

    // Jeśli nie zawiera @ — to username, szukamy emaila
    if (!loginEmail.includes('@')) {
      const { data, error: fnError } = await supabase.rpc('get_email_by_username', { p_username: loginEmail })
      if (fnError || !data) {
        setError('Nie znaleziono użytkownika o tej nazwie')
        setLoading(false); return
      }
      loginEmail = data
    }

    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: loginEmail, password })
    if (loginError) { setError('Zły login lub hasło'); setLoading(false); return }
    onLogin(data.user)
    setLoading(false)
  }

  async function handleRegister() {
    setLoading(true); setError(''); setInfo('')
    if (!username.trim()) { setError('Podaj nazwę użytkownika'); setLoading(false); return }
    if (password.length < 6) { setError('Hasło musi mieć min. 6 znaków'); setLoading(false); return }

    const { data: existing } = await supabase.from('profiles').select('id').eq('username', username.trim()).single()
    if (existing) { setError('Ta nazwa użytkownika jest już zajęta'); setLoading(false); return }

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id, username: username.trim(), discord: discord || null,
    })
    if (profileError) { setError(profileError.message); setLoading(false); return }

    onLogin(data.user)
    setLoading(false)
  }

  async function handleReset() {
    setLoading(true); setError(''); setInfo('')

    let resetEmail = identifier.trim()

    if (!resetEmail.includes('@')) {
      const { data, error: fnError } = await supabase.rpc('get_email_by_username', { p_username: resetEmail })
      if (fnError || !data) {
        setError('Nie znaleziono użytkownika o tej nazwie')
        setLoading(false); return
      }
      resetEmail = data
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (resetError) { setError(resetError.message); setLoading(false); return }
    setInfo(`Link do resetowania hasła został wysłany na adres email powiązany z tym kontem.`)
    setLoading(false)
  }

  const input = {
    width: '100%', padding: '13px 16px', borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.07)',
    color: 'white', fontSize: '0.92rem',
    fontFamily: 'Space Grotesk, sans-serif', outline: 'none',
    backdropFilter: 'blur(4px)', boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* MAPA W TLE */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <MapContainer
          center={[52.2297, 21.0122]} zoom={13}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false} dragging={false} scrollWheelZoom={false}
          doubleClickZoom={false} touchZoom={false} keyboard={false} attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        </MapContainer>
      </div>

      {/* OVERLAY */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'rgba(9,9,11,0.65)', backdropFilter: 'blur(8px)' }} />

      {/* FORMULARZ */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        fontFamily: 'Space Grotesk, sans-serif',
      }}>
        <div style={{
          width: '100%', maxWidth: '400px',
          background: 'rgba(12,12,14,0.82)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
          padding: '40px 36px',
          boxShadow: '0 40px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}>

          <div style={{ marginBottom: '28px' }}>
            <h1 style={{ color: 'white', fontWeight: 700, fontSize: '2rem', letterSpacing: '0.06em', margin: 0 }}>
              CTY-GRID
            </h1>
            <p style={{ color: '#52525b', fontSize: '0.85rem', marginTop: '6px' }}>
              {mode === 'login' ? 'Zaloguj się do swojego konta'
                : mode === 'register' ? 'Dołącz do społeczności'
                : 'Zresetuj hasło'}
            </p>
          </div>

          {/* Switcher — tylko login/register */}
          {mode !== 'reset' && (
            <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '4px' }}>
              {['login', 'register'].map(m => (
                <button key={m} onClick={() => { setMode(m); setError(''); setInfo('') }} style={{
                  flex: 1, padding: '8px', borderRadius: '8px', border: 'none',
                  background: mode === m ? 'rgba(255,255,255,0.1)' : 'none',
                  color: mode === m ? 'white' : '#52525b',
                  fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                  fontFamily: 'Space Grotesk, sans-serif', transition: 'all 0.15s',
                }}>
                  {m === 'login' ? 'Logowanie' : 'Rejestracja'}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* LOGIN */}
            {mode === 'login' && (
              <>
                <input
                  style={input} placeholder="Email lub nazwa użytkownika *"
                  value={identifier} onChange={e => setIdentifier(e.target.value)}
                />
                <input
                  style={input} placeholder="Hasło *" type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
                <button
                  onClick={() => { setMode('reset'); setError(''); setInfo('') }}
                  style={{ background: 'none', border: 'none', color: '#52525b', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'right', fontFamily: 'Space Grotesk, sans-serif', padding: '0' }}
                >Zapomniałem hasła →</button>
              </>
            )}

            {/* REGISTER */}
            {mode === 'register' && (
              <>
                <input style={input} placeholder="Nazwa użytkownika *" value={username} onChange={e => setUsername(e.target.value)} />
                <input style={input} placeholder="Email *" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                <input style={input} placeholder="Hasło * (min. 6 znaków)" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                <input style={input} placeholder="Discord (opcjonalnie)" value={discord} onChange={e => setDiscord(e.target.value)} />
              </>
            )}

            {/* RESET */}
            {mode === 'reset' && (
              <>
                <input
                  style={input} placeholder="Email lub nazwa użytkownika *"
                  value={identifier} onChange={e => setIdentifier(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleReset()}
                />
                <button
                  onClick={() => { setMode('login'); setError(''); setInfo('') }}
                  style={{ background: 'none', border: 'none', color: '#52525b', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left', fontFamily: 'Space Grotesk, sans-serif', padding: '0' }}
                >← Wróć do logowania</button>
              </>
            )}

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '0.82rem' }}>
                {error}
              </div>
            )}

            {info && (
              <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', fontSize: '0.82rem' }}>
                {info}
              </div>
            )}

            <button
              onClick={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleReset}
              disabled={loading}
              style={{
                marginTop: '4px', width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: loading ? 'rgba(249,115,22,0.4)' : 'linear-gradient(135deg, #f97316, #ea580c)',
                color: 'white', fontWeight: 700, fontSize: '0.95rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'Space Grotesk, sans-serif',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(249,115,22,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? '...'
                : mode === 'login' ? 'Zaloguj się →'
                : mode === 'register' ? 'Zarejestruj się →'
                : 'Wyślij link resetujący →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { t } from './i18n'
import { useState, useRef } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from './supabaseClient'
import HCaptcha from '@hcaptcha/react-hcaptcha'

const HCAPTCHA_SITE_KEY = 'ed8ee266-2288-47a0-afd2-fdf495063f88'

const USERNAME_WHITELIST = /^[a-zA-Z0-9._-]{3,20}$/
const USERNAME_BLACKLIST = /(?:jeb[a\u0105]c|kurw[aey]|chuj|pizd[a\u0119y]|pierdol|spierdal|cwel|smiec|\u015bmie[c\u0107]|debil|idiot|kretyn|pojeb|szmata|frajer|sukinsyn|dziwka|fuck|shit|bitch|asshole|dick|cunt|whore|nigg(?:er|a))/iu
function validateUsername(name) {
  if (!name) return 'Podaj nazwę użytkownika.'
  if (!USERNAME_WHITELIST.test(name)) return 'Nazwa może zawierać tylko litery, cyfry, kropki, myślniki i podkreślenia (3–20 znaków).'
  if (USERNAME_BLACKLIST.test(name)) return 'Ta nazwa użytkownika jest niedozwolona.'
  return null
}

export default function Auth({ onLogin }) {
  const [mode, setMode]               = useState('login')
  const [identifier, setIdentifier]   = useState('')
  const [username, setUsername]       = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [discord, setDiscord]         = useState('')
  const [error, setError]             = useState('')
  const [info, setInfo]               = useState('')
  const [loading, setLoading]         = useState(false)
  const [captchaToken, setCaptchaToken] = useState(null)
  const [captchaLoaded, setCaptchaLoaded] = useState(false)
  const captchaRef                    = useRef(null)

  function resetCaptcha() {
    setCaptchaToken(null)
    captchaRef.current?.resetCaptcha()
  }

  async function handleLogin() {
    if (!captchaToken) { setError(t('confirmNotBot')); return }
    setLoading(true); setError(''); setInfo('')

    let loginEmail = identifier.trim()
    if (!loginEmail.includes('@')) {
      const { data, error: fnError } = await supabase.rpc('get_email_by_username', { p_username: loginEmail })
      if (fnError || !data) { setError(t('userNotFound')); setLoading(false); resetCaptcha(); return }
      loginEmail = data
    }

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: loginEmail, password, options: { captchaToken },
    })
    if (loginError) { setError(t('wrongCredentials')); setLoading(false); resetCaptcha(); return }
    onLogin(data.user)
    setLoading(false)
  }

  async function handleRegister() {
    if (!captchaToken) { setError(t('confirmNotBot')); return }

    const usernameClean = username.trim()
    const usernameError = validateUsername(usernameClean)
    if (usernameError) { setError(usernameError); return }

    if (password.length < 6) { setError(t('passwordTooShort')); return }
    setLoading(true); setError(''); setInfo('')

    const { data: existing } = await supabase.from('profiles').select('id').eq('username', usernameClean).single()
    if (existing) { setError(t('usernameTaken')); setLoading(false); resetCaptcha(); return }

    const loginEmail = email.trim() || `${usernameClean.toLowerCase()}_${Date.now()}@cty-grid.local`

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: loginEmail, password, options: { captchaToken },
    })
    if (signUpError) { setError(signUpError.message); setLoading(false); resetCaptcha(); return }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id, username: usernameClean, discord: discord || null, email_set: !!email.trim(),
    })
    if (profileError) { setError(profileError.message); setLoading(false); resetCaptcha(); return }

    onLogin(data.user)
    setLoading(false)
  }

  async function handleReset() {
    if (!captchaToken) { setError(t('confirmNotBot')); return }
    setLoading(true); setError(''); setInfo('')

    let resetEmail = identifier.trim()
    if (!resetEmail.includes('@')) {
      const { data, error: fnError } = await supabase.rpc('get_email_by_username', { p_username: resetEmail })
      if (fnError || !data) { setError(t('userNotFoundEmail')); setLoading(false); resetCaptcha(); return }
      if (data.endsWith('@cty-grid.local')) { setError(t('noEmailReset')); setLoading(false); resetCaptcha(); return }
      resetEmail = data
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (resetError) { setError(resetError.message); setLoading(false); resetCaptcha(); return }
    setInfo(t('resetSent'))
    setLoading(false)
  }

  const input = {
    width: '100%', padding: '13px 16px', borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)',
    color: 'white', fontSize: '0.92rem', fontFamily: 'Space Grotesk, sans-serif',
    outline: 'none', backdropFilter: 'blur(4px)', boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <MapContainer center={[52.2297, 21.0122]} zoom={13} style={{ width: '100%', height: '100%' }}
          zoomControl={false} dragging={false} scrollWheelZoom={false}
          doubleClickZoom={false} touchZoom={false} keyboard={false} attributionControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        </MapContainer>
      </div>

      <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'rgba(9,9,11,0.65)', backdropFilter: 'blur(8px)' }} />

      <div style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Space Grotesk, sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '400px', background: 'rgba(12,12,14,0.82)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '40px 36px', boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}>

          <div style={{ marginBottom: '28px' }}>
            <h1 style={{ color: 'white', fontWeight: 700, fontSize: '2rem', letterSpacing: '0.06em', margin: 0 }}>CTY-GRID</h1>
            <p style={{ color: '#52525b', fontSize: '0.85rem', marginTop: '6px' }}>
              {mode === 'login' ? t('loginTitle') : mode === 'register' ? t('registerTitle') : t('resetTitle')}
            </p>
          </div>

          {mode !== 'reset' && (
            <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '4px' }}>
              {['login', 'register'].map(m => (
                <button key={m} onClick={() => { setMode(m); setError(''); setInfo(''); resetCaptcha() }} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: mode === m ? 'rgba(255,255,255,0.1)' : 'none', color: mode === m ? 'white' : '#52525b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
                  {m === 'login' ? t('loginTab') : t('registerTab')}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {mode === 'login' && (
              <>
                <input style={input} placeholder={t('emailOrUsername')} value={identifier} onChange={e => setIdentifier(e.target.value)} />
                <input style={input} placeholder={t('password')} type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && captchaToken && handleLogin()} />
                <button onClick={() => { setMode('reset'); setError(''); setInfo(''); resetCaptcha() }} style={{ background: 'none', border: 'none', color: '#52525b', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'right', fontFamily: 'Space Grotesk, sans-serif', padding: '0' }}>{t('forgotPassword')}</button>
              </>
            )}

            {mode === 'register' && (
              <>
                <input style={input} placeholder={t('username')} value={username} onChange={e => setUsername(e.target.value)} />
                {username && validateUsername(username.trim()) && (
                  <p style={{ color: '#f87171', fontSize: '0.75rem', margin: '-4px 0' }}>⚠️ {validateUsername(username.trim())}</p>
                )}
                <input style={input} placeholder={t('emailOptional')} type="email" value={email} onChange={e => setEmail(e.target.value)} />
                {!email && <p style={{ color: '#52525b', fontSize: '0.75rem', margin: '-4px 0' }}>⚠️ Bez emaila nie możesz zresetować hasła</p>}
                <input style={input} placeholder={t('passwordMin')} type="password" value={password} onChange={e => setPassword(e.target.value)} />
                <input style={input} placeholder={t('discordOptional')} value={discord} onChange={e => setDiscord(e.target.value)} />
              </>
            )}

            {mode === 'reset' && (
              <>
                <input style={input} placeholder={t('emailOrUsername')} value={identifier} onChange={e => setIdentifier(e.target.value)} onKeyDown={e => e.key === 'Enter' && captchaToken && handleReset()} />
                <button onClick={() => { setMode('login'); setError(''); setInfo(''); resetCaptcha() }} style={{ background: 'none', border: 'none', color: '#52525b', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left', fontFamily: 'Space Grotesk, sans-serif', padding: '0' }}>{t('backToLogin')}</button>
              </>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <HCaptcha
                ref={captchaRef}
                sitekey={HCAPTCHA_SITE_KEY}
                onVerify={token => { setCaptchaToken(token); setCaptchaLoaded(true) }}
                onExpire={() => setCaptchaToken(null)}
                onError={() => setCaptchaLoaded(false)}
                onLoad={() => setCaptchaLoaded(true)}
                theme="dark"
              />
              {!captchaLoaded && (
                <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', width: '100%', boxSizing: 'border-box' }}>
                  <p style={{ color: '#eab308', fontSize: '0.78rem', margin: 0, fontWeight: 600 }}>⚠️ Captcha się nie ładuje?</p>
                  <p style={{ color: '#71717a', fontSize: '0.73rem', margin: '4px 0 0' }}>Wyłącz AdBlocka / uBlock dla tej strony i odśwież.</p>
                </div>
              )}
            </div>

            {error && <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: '0.82rem' }}>{error}</div>}
            {info && <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', fontSize: '0.82rem' }}>{info}</div>}

            <button
              onClick={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleReset}
              disabled={loading || !captchaToken}
              style={{
                marginTop: '4px', width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                background: loading || !captchaToken ? 'rgba(249,115,22,0.4)' : 'linear-gradient(135deg, #f97316, #ea580c)',
                color: 'white', fontWeight: 700, fontSize: '0.95rem',
                cursor: loading || !captchaToken ? 'not-allowed' : 'pointer',
                fontFamily: 'Space Grotesk, sans-serif',
                boxShadow: loading || !captchaToken ? 'none' : '0 4px 20px rgba(249,115,22,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? '...' : mode === 'login' ? t('loginBtn') : mode === 'register' ? t('registerBtn') : t('resetBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

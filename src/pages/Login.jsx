import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else navigate('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--wcs-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/wcs_logo.png" alt="Woodinville Cookery Society" style={{ width: 240, height: 'auto', display: 'inline-block' }} />
        </div>

        {/* Label */}
        <p style={{ textAlign: 'center', fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', marginBottom: 24 }}>
          Host Access
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--wcs-green-dark)', marginBottom: 6, fontFamily: 'Inter, system-ui' }} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid var(--wcs-cream-dark)',
                borderRadius: 6,
                background: 'var(--wcs-white)',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 14,
                color: 'var(--wcs-green-dark)',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--wcs-green-dark)', marginBottom: 6, fontFamily: 'Inter, system-ui' }} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid var(--wcs-cream-dark)',
                borderRadius: 6,
                background: 'var(--wcs-white)',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 14,
                color: 'var(--wcs-green-dark)',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {error && <p style={{ fontSize: 13, color: '#b91c1c', margin: 0 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px 40px',
              background: loading ? 'var(--wcs-cream-dark)' : 'var(--wcs-green-dark)',
              color: 'var(--wcs-cream)',
              border: 'none',
              borderRadius: 6,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 8,
            }}
          >
            {loading ? 'Entering…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}

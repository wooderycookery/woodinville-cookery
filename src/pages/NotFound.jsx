import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--wcs-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <img src="/wcs_logo.png" alt="Woodinville Cookery Society" style={{ width: 120, height: 'auto', display: 'inline-block', marginBottom: 32 }} />
        <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '0 auto 28px' }} />
        <p className="font-serif" style={{ fontSize: 22, color: 'var(--wcs-green-dark)', marginBottom: 10, lineHeight: 1.4 }}>
          We can't seem to find that page.
        </p>
        <p style={{ fontSize: 14, color: 'var(--wcs-green-light)', marginBottom: 32, lineHeight: 1.7, fontFamily: 'Inter, system-ui' }}>
          Perhaps start from the beginning.
        </p>
        <Link
          to="/dashboard"
          style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', textDecoration: 'none' }}
        >
          Return to your events →
        </Link>
      </div>
    </div>
  )
}

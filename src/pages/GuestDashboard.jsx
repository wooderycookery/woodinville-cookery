import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const STATUS_LABEL = {
  attending:   'Attending',
  maybe:       'Maybe',
  declined:    'Declined',
  no_response: 'No response',
}

const STATUS_COLOR = {
  attending:   { color: 'var(--wcs-green-dark)',  bg: '#e8f0e8' },
  maybe:       { color: 'var(--wcs-copper)',       bg: '#f5ede5' },
  declined:    { color: '#888',                    bg: '#f0f0f0' },
  no_response: { color: 'var(--wcs-green-muted)',  bg: 'var(--wcs-cream-mid)' },
}

function parseVibe(vibe) {
  if (!vibe) return {}
  try { return JSON.parse(vibe) } catch { return {} }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  })
}

function isPast(dateStr) {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

export default function GuestDashboard() {
  const [guest, setGuest]             = useState(null)
  const [upcoming, setUpcoming]       = useState([])
  const [past, setPast]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  useEffect(() => {
    const token = localStorage.getItem('wcs_guest_token')
    if (!token) {
      setError('no_token')
      setLoading(false)
      return
    }
    fetch('/api/guest-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError('invalid'); return }
        setGuest(data.guest)
        const sorted = (data.invitations || []).sort(
          (a, b) => new Date(a.event.date) - new Date(b.event.date)
        )
        setUpcoming(sorted.filter(i => !isPast(i.event.date)))
        setPast(sorted.filter(i => isPast(i.event.date)).reverse())
      })
      .catch(() => setError('failed'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--wcs-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 20, height: 20, border: '2px solid var(--wcs-cream-dark)', borderTopColor: 'var(--wcs-green-dark)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: 'var(--wcs-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <img src="/WCS_logo.png" alt="Woodinville Cookery Society" style={{ width: 120, height: 'auto', display: 'inline-block', marginBottom: 28 }} />
        <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '0 auto 28px' }} />
        <p className="font-serif" style={{ fontSize: 20, color: 'var(--wcs-green-dark)', marginBottom: 10 }}>
          We can't locate your invitations.
        </p>
        <p style={{ fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', lineHeight: 1.7 }}>
          Visit an event page using your personal invitation link to get started.
        </p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--wcs-cream)' }}>
      <header style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--wcs-cream-dark)' }}>
        <img src="/WCS_logo.png" alt="Woodinville Cookery Society" style={{ width: 120, height: 'auto' }} />
      </header>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px 60px' }}>

        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 8 }}>
            Your invitations
          </p>
          {guest?.name && (
            <p className="font-serif" style={{ fontSize: 24, color: 'var(--wcs-green-dark)', margin: 0 }}>
              {guest.name}
            </p>
          )}
        </div>

        {upcoming.length === 0 && past.length === 0 && (
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>
            No invitations on record.
          </p>
        )}

        {upcoming.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 14 }}>
              Upcoming
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {upcoming.map(inv => <InvitationCard key={inv.guestId} inv={inv} />)}
            </div>
          </section>
        )}

        {past.length > 0 && (
          <section>
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginBottom: 14 }}>
              Past
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {past.map(inv => <InvitationCard key={inv.guestId} inv={inv} dimmed />)}
            </div>
          </section>
        )}

      </main>
    </div>
  )
}

function InvitationCard({ inv, dimmed }) {
  const { event, rsvpStatus, token } = inv
  const { hostNames, heroImageUrl } = parseVibe(event.vibe)
  const status = rsvpStatus || 'no_response'
  const { color, bg } = STATUS_COLOR[status] || STATUS_COLOR.no_response
  const eventUrl = `/event/${event.id}?token=${token}`

  return (
    <Link
      to={eventUrl}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div style={{
        background: 'var(--wcs-white)',
        border: '1px solid var(--wcs-cream-dark)',
        borderRadius: 10,
        overflow: 'hidden',
        opacity: dimmed ? 0.6 : 1,
        transition: 'box-shadow 0.15s',
      }}>
        {heroImageUrl && (
          <img
            src={heroImageUrl}
            alt={event.name}
            style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
          />
        )}
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p className="font-serif" style={{ fontSize: 17, color: 'var(--wcs-green-dark)', margin: '0 0 4px', lineHeight: 1.3 }}>
              {event.name}
            </p>
            <p style={{ fontSize: 11, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 4px' }}>
              {formatDate(event.date)}
            </p>
            {hostNames && (
              <p style={{ fontSize: 12, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', margin: 0 }}>
                Hosted by {hostNames}
              </p>
            )}
          </div>
          <span style={{
            flexShrink: 0,
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontFamily: 'Inter, system-ui',
            color,
            background: bg,
            padding: '4px 10px',
            borderRadius: 4,
            marginTop: 2,
          }}>
            {STATUS_LABEL[status]}
          </span>
        </div>
      </div>
    </Link>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function parseVibe(vibe) {
  if (!vibe) return {}
  try { return JSON.parse(vibe) } catch { return {} }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  })
}

function isPast(dateStr) {
  if (!dateStr) return false
  return new Date(dateStr + 'T12:00:00') < new Date()
}

const CopperRule = () => (
  <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '16px auto' }} />
)

export default function History() {
  const navigate = useNavigate()
  const [upcoming, setUpcoming]   = useState([])
  const [past, setPast]           = useState([])
  const [archived, setArchived]   = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }

      const { data: events } = await supabase
        .from('events')
        .select('id, name, date, vibe, pre_gallery_open, post_gallery_open, archived')
        .eq('host_id', user.id)
        .order('date', { ascending: false })

      if (events?.length) {
        const { data: guestRows } = await supabase
          .from('guests')
          .select('event_id, rsvp_status')
          .in('event_id', events.map(e => e.id))

        const countsByEvent = {}
        for (const g of guestRows || []) {
          if (!countsByEvent[g.event_id]) countsByEvent[g.event_id] = { attending: 0, total: 0 }
          countsByEvent[g.event_id].total++
          if (g.rsvp_status === 'attending') countsByEvent[g.event_id].attending++
        }

        const enriched = events.map(e => ({ ...e, counts: countsByEvent[e.id] || { attending: 0, total: 0 } }))
        const active = enriched.filter(e => !e.archived)
        setUpcoming(active.filter(e => !isPast(e.date)).reverse())
        setPast(active.filter(e => isPast(e.date)))
        setArchived(enriched.filter(e => e.archived))
      }

      setLoading(false)
    }
    load()
  }, [navigate])

  async function handleUnarchive(eventId) {
    const { error } = await supabase.from('events').update({ archived: false }).eq('id', eventId)
    if (!error) setArchived(prev => prev.filter(e => e.id !== eventId))
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--wcs-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 20, height: 20, border: '2px solid var(--wcs-cream-dark)', borderTopColor: 'var(--wcs-green-dark)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--wcs-cream)' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px 60px' }}>

        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <Link to="/dashboard" style={{ display: 'inline-block', lineHeight: 0 }}>
            <img src="/wcs_logo.png" alt="Woodinville Cookery Society" style={{ width: 120, height: 'auto' }} />
          </Link>
        </div>

        <CopperRule />

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 className="font-serif" style={{ fontSize: 28, color: 'var(--wcs-green-dark)', margin: '0 0 8px' }}>
            Your gatherings
          </h1>
          <Link to="/dashboard" style={{ fontSize: 11, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', letterSpacing: '0.08em', textDecoration: 'none' }}>
            ← Dashboard
          </Link>
        </div>

        {upcoming.length === 0 && past.length === 0 && archived.length === 0 && (
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', lineHeight: 1.7 }}>
            Your history with the Woodinville Cookery Society begins with your first event.
          </p>
        )}

        {upcoming.length > 0 && (
          <section style={{ marginBottom: 44 }}>
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 14 }}>
              What's ahead
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {upcoming.map(event => <HostEventCard key={event.id} event={event} />)}
            </div>
          </section>
        )}

        {past.length > 0 && (
          <section style={{ marginBottom: archived.length > 0 ? 44 : 0 }}>
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginBottom: 14 }}>
              What we've shared
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {past.map(event => <HostEventCard key={event.id} event={event} dimmed />)}
            </div>
          </section>
        )}

        {archived.length > 0 && (
          <section>
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginBottom: 14 }}>
              Shelved
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {archived.map(event => (
                <HostEventCard key={event.id} event={event} dimmed onUnarchive={() => handleUnarchive(event.id)} />
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

function HostEventCard({ event, dimmed, onUnarchive }) {
  const { heroImageUrl } = parseVibe(event.vibe)
  const hasGallery = event.pre_gallery_open || event.post_gallery_open
  const attendingCount = event.counts?.attending || 0

  return (
    <div style={{ background: 'var(--wcs-white)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 10, overflow: 'hidden', opacity: dimmed ? 0.7 : 1 }}>
      <Link to={`/event/${event.id}`} style={{ textDecoration: 'none', display: 'block' }}>
        {heroImageUrl && (
          <img
            src={heroImageUrl}
            alt={event.name}
            style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }}
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
            {dimmed && attendingCount > 0 && (
              <p style={{ fontSize: 12, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', margin: 0 }}>
                {attendingCount} {attendingCount === 1 ? 'guest' : 'guests'} attended
              </p>
            )}
          </div>
          <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Inter, system-ui', color: 'var(--wcs-copper)', background: '#f5ede5', padding: '4px 10px', borderRadius: 4, marginTop: 2 }}>
            Host
          </span>
        </div>
      </Link>
      {(hasGallery || onUnarchive) && (
        <div style={{ padding: '0 20px 14px', display: 'flex', gap: 14 }}>
          {event.pre_gallery_open && (
            <Link to={`/gallery/${event.id}/pre`} style={{ fontSize: 11, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', letterSpacing: '0.06em', textDecoration: 'none' }}>
              View photographs →
            </Link>
          )}
          {event.post_gallery_open && (
            <Link to={`/gallery/${event.id}/post`} style={{ fontSize: 11, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', letterSpacing: '0.06em', textDecoration: 'none' }}>
              What we remember →
            </Link>
          )}
          {onUnarchive && (
            <button
              onClick={onUnarchive}
              style={{ fontSize: 11, color: 'var(--wcs-green-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, system-ui', padding: 0, letterSpacing: '0.06em' }}
            >
              Restore to dashboard
            </button>
          )}
        </div>
      )}
    </div>
  )
}

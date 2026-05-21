import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import MessageBoard from '../components/MessageBoard'

function formatDateLabel(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).toUpperCase()
}

function formatDateShort(dateStr) {
  if (!dateStr) return 'that day'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  })
}

function formatRsvpDeadline(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function parseVibe(vibe) {
  if (!vibe) return { heroImageUrl: null, hostNames: '' }
  try { return JSON.parse(vibe) }
  catch { return { heroImageUrl: vibe.startsWith('http') ? vibe : null, hostNames: '' } }
}

const CopperRule = () => (
  <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '16px auto' }} />
)

const RSVP_OPTIONS = [
  { value: 'attending',  label: 'Attending' },
  { value: 'maybe',      label: 'I hope to make it' },
  { value: 'declined',   label: 'Send my regrets' },
]

const CONFIRMATION = {
  attending: { heading: () => "We'll set a place for you.",             sub: 'A note has been sent to your inbox.' },
  maybe:     { heading: () => 'We hope the evening finds you free.',    sub: 'A note has been sent to your inbox.' },
  declined:  { heading: () => "We're sorry to miss you this time.",     sub: 'We hope to share a table another evening.' },
}

export default function EventLanding() {
  const { eventId } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [event, setEvent]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [guest, setGuest]             = useState(null)
  const [guestLoading, setGuestLoading] = useState(false)

  const [selectedStatus, setSelectedStatus] = useState(null)
  const [dietaryNotes, setDietaryNotes]     = useState('')
  const [submitting, setSubmitting]         = useState(false)
  const [rsvpError, setRsvpError]           = useState('')
  const [submitted, setSubmitted]           = useState(false)

  const [isHost, setIsHost]     = useState(false)
  const [hostUserId, setHostUserId] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [newHeroImage, setNewHeroImage] = useState(null)
  const [heroPreview, setHeroPreview]   = useState(null)
  const [imageError, setImageError]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState('')

  const [hostGuests, setHostGuests]         = useState([])
  const [hostBringList, setHostBringList]   = useState([])
  const [hostBringClaims, setHostBringClaims] = useState([])
  const [addGuestText, setAddGuestText]     = useState('')
  const [addGuestSending, setAddGuestSending] = useState(false)
  const [addGuestResult, setAddGuestResult] = useState(null)
  const [addGuestError, setAddGuestError]   = useState('')

  const [galleryOpening, setGalleryOpening] = useState(null)
  const [galleryOpenError, setGalleryOpenError] = useState('')

  useEffect(() => {
    supabase
      .from('events')
      .select('id, name, date, description, vibe, theme, dress_code, what_to_expect, rsvp_deadline, location, host_id, pre_gallery_open, post_gallery_open')
      .eq('id', eventId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); setLoading(false); return }
        setEvent(data)
        setLoading(false)
        supabase.auth.getUser().then(async ({ data: { user } }) => {
          const eventData = data
          if (user && user.id === eventData.host_id) {
            setIsHost(true)
            setHostUserId(user.id)

            const { data: guestsData } = await supabase
              .from('guests')
              .select('id, rsvp_status, dietary_notes, contacts(name, email)')
              .eq('event_id', eventData.id)
            setHostGuests(guestsData || [])

            const { data: itemsData } = await supabase
              .from('bring_list_items')
              .select('id, category, label, slots_total')
              .eq('event_id', eventData.id)
              .order('created_at', { ascending: true })
            setHostBringList(itemsData || [])

            if (itemsData?.length) {
              const { data: claimsData } = await supabase
                .from('bring_list_claims')
                .select('id, item_id, guest_id, guests(contacts(name, email))')
                .in('item_id', itemsData.map(i => i.id))
              setHostBringClaims(claimsData || [])
            }
          }
        })
      })
  }, [eventId])

  function openEdit() {
    const { hostNames, heroImageUrl } = parseVibe(event.vibe)
    setEditForm({
      name:           event.name || '',
      date:           event.date ? event.date.slice(0, 10) : '',
      description:    event.description || '',
      hostNames:      hostNames || '',
      theme:          event.theme || '',
      location:       event.location || '',
      dress_code:     event.dress_code || '',
      what_to_expect: event.what_to_expect || '',
      rsvp_deadline:  event.rsvp_deadline || '',
    })
    setNewHeroImage(null)
    setHeroPreview(heroImageUrl || null)
    setImageError('')
    setSaveError('')
    setEditMode(true)
  }

  function handleHeroChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setImageError('Image must be under 10 MB.')
      return
    }
    setImageError('')
    setNewHeroImage(file)
    setHeroPreview(URL.createObjectURL(file))
  }

  async function handleSaveEvent(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      const currentVibe = parseVibe(event.vibe)
      let heroImageUrl = currentVibe.heroImageUrl || null

      if (newHeroImage && hostUserId) {
        const ext = newHeroImage.name.split('.').pop()
        const path = `${hostUserId}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('event-images')
          .upload(path, newHeroImage)
        if (uploadError) {
          console.error('Storage upload error:', uploadError)
          throw new Error(`Image upload failed: ${uploadError.message}`)
        }
        const { data: { publicUrl } } = supabase.storage.from('event-images').getPublicUrl(path)
        heroImageUrl = publicUrl
      }

      const newVibe = JSON.stringify({ ...currentVibe, hostNames: editForm.hostNames, heroImageUrl })
      const { data: updated, error } = await supabase
        .from('events')
        .update({
          name:           editForm.name,
          date:           editForm.date ? new Date(editForm.date + 'T12:00:00').toISOString() : event.date,
          description:    editForm.description || null,
          vibe:           newVibe,
          theme:          editForm.theme || null,
          location:       editForm.location || null,
          dress_code:     editForm.dress_code || null,
          what_to_expect: editForm.what_to_expect || null,
          rsvp_deadline:  editForm.rsvp_deadline || null,
        })
        .eq('id', event.id)
        .select('id, name, date, description, vibe, theme, dress_code, what_to_expect, rsvp_deadline, location, host_id')
        .single()
      if (error) {
        console.error('Event update error:', error)
        throw new Error(error.message)
      }
      setEvent(updated)
      setEditMode(false)
    } catch (err) {
      console.error('Save failed:', err)
      setSaveError(err.message || 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!token) return
    setGuestLoading(true)
    fetch('/api/validate-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setGuest(data)
          localStorage.setItem('wcs_guest_token', token)
          if (data.rsvpStatus && data.rsvpStatus !== 'no_response') {
            setSelectedStatus(data.rsvpStatus)
            setDietaryNotes(data.dietaryNotes || '')
            setSubmitted(true)
          }
        }
      })
      .catch(() => {})
      .finally(() => setGuestLoading(false))
  }, [token])

  async function handleRsvpSubmit(e) {
    e.preventDefault()
    if (!selectedStatus) return
    setSubmitting(true)
    setRsvpError('')
    try {
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin
      const res = await fetch('/api/submit-rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rsvpStatus: selectedStatus, dietaryNotes, appUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit RSVP')
      setGuest(prev => ({ ...prev, rsvpStatus: selectedStatus }))
      setSubmitted(true)
    } catch (err) {
      setRsvpError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddGuests(e) {
    e.preventDefault()
    const guests = addGuestText
      .split(/[\n,;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s.includes('@') && s.includes('.'))
      .map(email => ({ email, name: email.split('@')[0] }))
    if (guests.length === 0) return
    setAddGuestSending(true)
    setAddGuestError('')
    setAddGuestResult(null)
    try {
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin
      const res = await fetch('/api/add-guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, guests, appUrl }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to add guests')
      setAddGuestResult(body)
      setAddGuestText('')
      // Refresh guest list
      const { data: guestsData } = await supabase
        .from('guests')
        .select('id, rsvp_status, dietary_notes, contacts(name, email)')
        .eq('event_id', eventId)
      setHostGuests(guestsData || [])
    } catch (err) {
      setAddGuestError(err.message)
    } finally {
      setAddGuestSending(false)
    }
  }

  async function handleOpenGallery(phase) {
    if (!hostUserId) return
    setGalleryOpening(phase)
    setGalleryOpenError('')
    try {
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin
      const res = await fetch('/api/gallery-open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, phase, authorId: hostUserId, appUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to open gallery')
      setEvent(prev => ({
        ...prev,
        pre_gallery_open: phase === 'pre' ? true : prev.pre_gallery_open,
        post_gallery_open: phase === 'post' ? true : prev.post_gallery_open,
      }))
    } catch (err) {
      setGalleryOpenError(err.message)
    } finally {
      setGalleryOpening(null)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--wcs-cream)' }}>
      <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--wcs-cream-dark)', borderTopColor: 'var(--wcs-green-dark)' }} />
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--wcs-cream)' }}>
      <div className="text-center">
        <p className="font-serif text-xl" style={{ color: 'var(--wcs-green-dark)' }}>Event not found.</p>
        <p className="text-sm mt-2" style={{ color: 'var(--wcs-green-muted)' }}>Check your invitation link and try again.</p>
      </div>
    </div>
  )

  const { heroImageUrl, hostNames } = parseVibe(event.vibe)
  const teaserLine = event.description
  const dateLabel  = formatDateLabel(event.date)
  const dateShort  = formatDateShort(event.date)

  return (
    <div className="min-h-screen" style={{ background: 'var(--wcs-cream)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 60px' }}>

        {/* Logo + host controls */}
        <div style={{ position: 'relative', textAlign: 'center' }}>
          {isHost ? (
            <Link to="/dashboard" style={{ display: 'inline-block', lineHeight: 0 }}>
              <img src="/WCS_logo.png" alt="Woodinville Cookery Society" style={{ width: 140, height: 'auto', display: 'inline-block' }} />
            </Link>
          ) : guest ? (
            <Link to="/my-invitations" style={{ display: 'inline-block', lineHeight: 0 }}>
              <img src="/WCS_logo.png" alt="Woodinville Cookery Society" style={{ width: 140, height: 'auto', display: 'inline-block' }} />
            </Link>
          ) : (
            <img src="/WCS_logo.png" alt="Woodinville Cookery Society" style={{ width: 140, height: 'auto', display: 'inline-block' }} />
          )}
          {isHost && (
            <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <button
                onClick={openEdit}
                style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', background: 'none', border: '1px solid var(--wcs-cream-dark)', borderRadius: 4, padding: '5px 10px', cursor: 'pointer', fontFamily: 'Inter, system-ui' }}
              >
                Edit
              </button>
              <Link
                to="/dashboard"
                style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-copper)', textDecoration: 'none', fontFamily: 'Inter, system-ui' }}
              >
                ← Dashboard
              </Link>
            </div>
          )}
        </div>

        <CopperRule />

        {/* Hero image */}
        <div style={{ marginBottom: 32 }}>
          <img
            key={heroImageUrl || 'placeholder'}
            src={heroImageUrl || '/eventimageplaceholder.png'}
            alt={event.name}
            onError={e => {
              e.target.src = '/eventimageplaceholder.png'
              e.target.style.objectFit = 'contain'
              e.target.style.borderRadius = '0'
            }}
            style={{
              width: '100%',
              maxHeight: 280,
              objectFit: heroImageUrl ? 'cover' : 'contain',
              display: 'block',
              ...(heroImageUrl ? { borderRadius: 10 } : {}),
            }}
          />
        </div>

        {/* Date label */}
        <p className="text-center" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', marginBottom: 8 }}>
          {dateLabel}
        </p>

        {/* Event name */}
        <h1 className="text-center font-serif" style={{ fontSize: 32, color: 'var(--wcs-green-dark)', marginTop: 8, lineHeight: 1.25 }}>
          {event.name}
        </h1>

        {/* Host name */}
        {hostNames && (
          <p className="text-center" style={{ fontSize: 13, color: 'var(--wcs-green-light)', marginTop: 8 }}>
            Hosted by {hostNames}
          </p>
        )}

        <CopperRule />

        {/* Teaser / description */}
        {teaserLine && (
          <p className="text-center" style={{ fontSize: 15, color: 'var(--wcs-green-mid)', lineHeight: 1.8, maxWidth: 480, margin: '0 auto' }}>
            {teaserLine}
          </p>
        )}

        {/* Info pills: dress code + location */}
        {(event.dress_code || event.location) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 20 }}>
            {event.dress_code && (
              <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-green-dark)', background: 'var(--wcs-cream-mid)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 4, padding: '5px 12px', fontFamily: 'Inter, system-ui' }}>
                {event.dress_code}
              </span>
            )}
            {event.location && (
              <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-green-dark)', background: 'var(--wcs-cream-mid)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 4, padding: '5px 12px', fontFamily: 'Inter, system-ui' }}>
                {event.location}
              </span>
            )}
          </div>
        )}

        {/* What to expect */}
        {event.what_to_expect && (
          <div style={{ marginTop: 28, padding: '24px', background: 'var(--wcs-white)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', marginBottom: 10, fontFamily: 'Inter, system-ui' }}>
              What to Expect
            </p>
            <p style={{ fontSize: 14, color: 'var(--wcs-green-mid)', lineHeight: 1.8, margin: 0, fontFamily: 'Inter, system-ui' }}>
              {event.what_to_expect}
            </p>
          </div>
        )}

        {/* Map embed */}
        {event.location && (
          <div style={{ marginTop: 28 }}>
            <iframe
              title="Event location"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(event.location)}&output=embed`}
              width="100%"
              height="200"
              style={{ border: 'none', borderRadius: 10, display: 'block' }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <a
              href={`https://maps.google.com/maps?q=${encodeURIComponent(event.location)}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block', textAlign: 'center', marginTop: 10, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', textDecoration: 'none' }}
            >
              Get directions →
            </a>
          </div>
        )}

        {/* RSVP deadline */}
        {event.rsvp_deadline && (
          <p className="text-center" style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-copper)', marginTop: 24, fontFamily: 'Inter, system-ui' }}>
            Please respond by {formatRsvpDeadline(event.rsvp_deadline)}
          </p>
        )}

        {/* RSVP section */}
        <div style={{ marginTop: 32 }}>
          {guestLoading ? (
            <div className="text-center py-8">
              <div className="w-5 h-5 border-2 rounded-full animate-spin inline-block" style={{ borderColor: 'var(--wcs-cream-dark)', borderTopColor: 'var(--wcs-green-dark)' }} />
            </div>
          ) : guest ? (
            submitted ? (
              <ConfirmationBlock
                rsvpStatus={selectedStatus}
                onUpdate={() => setSubmitted(false)}
                icsUrl={selectedStatus !== 'declined' ? `/api/generate-ics?eventId=${eventId}&token=${token}` : null}
              />
            ) : (
              <RsvpForm
                selectedStatus={selectedStatus}
                setSelectedStatus={setSelectedStatus}
                dietaryNotes={dietaryNotes}
                setDietaryNotes={setDietaryNotes}
                onSubmit={handleRsvpSubmit}
                submitting={submitting}
                error={rsvpError}
              />
            )
          ) : (
            <p className="text-center" style={{ fontSize: 13, color: 'var(--wcs-green-muted)', letterSpacing: '0.05em' }}>
              The full invitation follows.
            </p>
          )}
        </div>

        {/* Bring-list — shown after RSVP if attending or maybe */}
        {submitted && (selectedStatus === 'attending' || selectedStatus === 'maybe') && guest && (
          <div style={{ marginTop: 32 }}>
            <BringListGuest eventId={eventId} guestId={guest.guestId} token={token} />
          </div>
        )}

        {/* Message board — one shared board for confirmed guests and host */}
        {(isHost || (submitted && (selectedStatus === 'attending' || selectedStatus === 'maybe') && guest)) && (
          <div style={{ marginTop: 40 }}>
            <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '0 auto 32px' }} />
            <MessageBoard
              eventId={eventId}
              isHost={isHost}
              hostUserId={hostUserId}
              guestToken={token}
              guestName={guest?.guestName}
            />
          </div>
        )}

        {/* Gallery links — for confirmed guests */}
        {submitted && (selectedStatus === 'attending' || selectedStatus === 'maybe') && guest && (event.pre_gallery_open || event.post_gallery_open) && (
          <div style={{ marginTop: 40 }}>
            <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '0 auto 24px' }} />
            <p style={{ textAlign: 'center', fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', marginBottom: 16, fontFamily: 'Inter, system-ui' }}>
              Photographs
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {event.pre_gallery_open && (
                <Link
                  to={`/gallery/${eventId}/pre${token ? `?token=${token}` : ''}`}
                  style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui', textDecoration: 'none', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, padding: '10px 20px' }}
                >
                  Pre-event photographs →
                </Link>
              )}
              {event.post_gallery_open && (
                <Link
                  to={`/gallery/${eventId}/post${token ? `?token=${token}` : ''}`}
                  style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui', textDecoration: 'none', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, padding: '10px 20px' }}
                >
                  What we remember →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Host: guest roster + bring list */}
        {isHost && (
          <div style={{ marginTop: 48 }}>
            <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '0 auto 32px' }} />

            {/* RSVP summary counts */}
            <HostRsvpSummary guests={hostGuests} />

            {/* Guest list */}
            {hostGuests.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 12 }}>
                  Guest list
                </p>
                <div style={{ border: '1px solid var(--wcs-cream-dark)', borderRadius: 8, overflow: 'hidden', background: 'var(--wcs-white)' }}>
                  {hostGuests.map((g, i) => {
                    const statusColor = { attending: '#2c4a2e', maybe: 'var(--wcs-copper)', declined: '#999', no_response: '#bbb' }
                    const statusLabel = { attending: 'Attending', maybe: 'Maybe', declined: 'Declined', no_response: 'No response' }
                    return (
                      <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderTop: i > 0 ? '0.5px solid var(--wcs-cream-dark)' : 'none', background: i % 2 === 0 ? 'var(--wcs-white)' : 'var(--wcs-cream-mid)' }}>
                        <div>
                          <span style={{ fontSize: 13, fontFamily: 'Inter, system-ui', color: 'var(--wcs-green-dark)', fontWeight: 500 }}>
                            {g.contacts?.name || g.contacts?.email}
                          </span>
                          {g.contacts?.name && g.contacts?.email && (
                            <span style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginLeft: 8 }}>
                              {g.contacts.email}
                            </span>
                          )}
                          {g.dietary_notes && (
                            <p style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', margin: '2px 0 0' }}>
                              Note: {g.dietary_notes}
                            </p>
                          )}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: statusColor[g.rsvp_status] || '#bbb', fontFamily: 'Inter, system-ui', flexShrink: 0, marginLeft: 12 }}>
                          {statusLabel[g.rsvp_status] || 'No response'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Bring list claims */}
            {hostBringList.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 12 }}>
                  What we're bringing
                </p>
                <div style={{ border: '1px solid var(--wcs-cream-dark)', borderRadius: 8, overflow: 'hidden', background: 'var(--wcs-white)' }}>
                  {hostBringList.map((item, i) => {
                    const claims = hostBringClaims.filter(c => c.item_id === item.id)
                    const claimedBy = claims.map(c => c.guests?.contacts?.name || c.guests?.contacts?.email || 'Someone').join(', ')
                    const open = item.slots_total - claims.length
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderTop: i > 0 ? '0.5px solid var(--wcs-cream-dark)' : 'none', background: i % 2 === 0 ? 'var(--wcs-white)' : 'var(--wcs-cream-mid)' }}>
                        <div>
                          <span style={{ fontSize: 13, fontFamily: 'Inter, system-ui', color: 'var(--wcs-green-dark)', fontWeight: 500 }}>{item.label}</span>
                          {item.category && <span style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginLeft: 8 }}>{item.category}</span>}
                          {claimedBy && (
                            <p style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', margin: '2px 0 0' }}>{claimedBy}</p>
                          )}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: open === 0 ? 'var(--wcs-green-dark)' : 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', flexShrink: 0, marginLeft: 12 }}>
                          {open === 0 ? 'Claimed' : `${open} open`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Gallery controls */}
            <div style={{ marginTop: 28 }}>
              <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 12 }}>
                Photo galleries
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Pre-event gallery */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--wcs-white)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontFamily: 'Inter, system-ui', color: 'var(--wcs-green-dark)', fontWeight: 500 }}>Pre-event</span>
                    <span style={{ fontSize: 11, fontFamily: 'Inter, system-ui', color: event.pre_gallery_open ? 'var(--wcs-green-dark)' : 'var(--wcs-green-muted)', marginLeft: 10 }}>
                      {event.pre_gallery_open ? 'Open' : 'Not yet opened'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {event.pre_gallery_open ? (
                      <Link
                        to={`/gallery/${eventId}/pre`}
                        style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', textDecoration: 'none' }}
                      >
                        View →
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleOpenGallery('pre')}
                        disabled={galleryOpening === 'pre'}
                        style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--wcs-green-dark)', background: 'none', border: '1px solid var(--wcs-cream-dark)', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontFamily: 'Inter, system-ui' }}
                      >
                        {galleryOpening === 'pre' ? 'Opening…' : 'Open gallery'}
                      </button>
                    )}
                  </div>
                </div>
                {/* Post-event gallery */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--wcs-white)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontFamily: 'Inter, system-ui', color: 'var(--wcs-green-dark)', fontWeight: 500 }}>Post-event</span>
                    <span style={{ fontSize: 11, fontFamily: 'Inter, system-ui', color: event.post_gallery_open ? 'var(--wcs-green-dark)' : 'var(--wcs-green-muted)', marginLeft: 10 }}>
                      {event.post_gallery_open ? 'Open' : 'Not yet opened'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {event.post_gallery_open ? (
                      <Link
                        to={`/gallery/${eventId}/post`}
                        style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', textDecoration: 'none' }}
                      >
                        View →
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleOpenGallery('post')}
                        disabled={galleryOpening === 'post'}
                        style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--wcs-green-dark)', background: 'none', border: '1px solid var(--wcs-cream-dark)', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontFamily: 'Inter, system-ui' }}
                      >
                        {galleryOpening === 'post' ? 'Opening…' : 'Open gallery'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {galleryOpenError && (
                <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 8, fontFamily: 'Inter, system-ui' }}>{galleryOpenError}</p>
              )}
            </div>

            {/* Add guests */}
            <div style={{ marginTop: 28 }}>
              <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 12 }}>
                Add guests
              </p>
              <form onSubmit={handleAddGuests}>
                <textarea
                  value={addGuestText}
                  onChange={e => { setAddGuestText(e.target.value); setAddGuestResult(null) }}
                  placeholder="Paste or type email addresses, one per line"
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 14, color: 'var(--wcs-green-dark)', boxSizing: 'border-box', outline: 'none', resize: 'vertical', lineHeight: 1.6, marginBottom: 8 }}
                />
                {addGuestError && (
                  <p style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8, fontFamily: 'Inter, system-ui' }}>{addGuestError}</p>
                )}
                {addGuestResult && (
                  <p style={{ fontSize: 12, color: 'var(--wcs-green-dark)', marginBottom: 8, fontFamily: 'Inter, system-ui' }}>
                    {addGuestResult.added > 0
                      ? `${addGuestResult.added} invitation${addGuestResult.added !== 1 ? 's' : ''} sent.`
                      : 'All addresses were already on the list.'}
                    {addGuestResult.skipped > 0 && addGuestResult.added > 0 ? ` ${addGuestResult.skipped} already invited.` : ''}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={addGuestSending || !addGuestText.trim()}
                  style={{ padding: '10px 24px', background: addGuestText.trim() && !addGuestSending ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)', color: 'var(--wcs-cream)', border: 'none', borderRadius: 6, fontFamily: 'Inter, system-ui', fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: addGuestText.trim() && !addGuestSending ? 'pointer' : 'not-allowed' }}
                >
                  {addGuestSending ? 'Sending…' : 'Add & invite'}
                </button>
              </form>
            </div>

          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--wcs-cream-dark)', marginTop: 48, paddingTop: 20 }}>
          <p className="text-center" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)' }}>
            Woodinville Cookery Society · woodinvillecookery.com
          </p>
        </div>

      </div>

      {/* Host edit overlay */}
      {editMode && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,74,46,0.35)' }} onClick={() => setEditMode(false)} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', background: 'var(--wcs-white)', borderRadius: '16px 16px 0 0', padding: '32px 28px 40px', boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}>

            {/* Drag handle */}
            <div style={{ width: 36, height: 4, background: 'var(--wcs-cream-dark)', borderRadius: 2, margin: '0 auto 28px' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 className="font-serif" style={{ fontSize: 20, color: 'var(--wcs-green-dark)', margin: 0 }}>Edit event details</h2>
              <button onClick={() => setEditMode(false)} style={{ fontSize: 18, color: 'var(--wcs-green-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <form onSubmit={handleSaveEvent} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={editLabelStyle}>Event name</label>
                  <input type="text" required value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} style={editInputStyle} />
                </div>
                <div>
                  <label style={editLabelStyle}>Date</label>
                  <input type="date" value={editForm.date} onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} style={editInputStyle} />
                </div>
                <div>
                  <label style={editLabelStyle}>RSVP deadline</label>
                  <input type="date" value={editForm.rsvp_deadline} onChange={e => setEditForm(p => ({ ...p, rsvp_deadline: e.target.value }))} style={editInputStyle} />
                </div>
                <div>
                  <label style={editLabelStyle}>Location / address</label>
                  <input type="text" value={editForm.location} onChange={e => setEditForm(p => ({ ...p, location: e.target.value }))} placeholder="123 Vine St, Woodinville WA" style={editInputStyle} />
                </div>
                <div>
                  <label style={editLabelStyle}>Dress suggestion</label>
                  <input type="text" value={editForm.dress_code} onChange={e => setEditForm(p => ({ ...p, dress_code: e.target.value }))} placeholder="Smart casual" style={editInputStyle} />
                </div>
                <div>
                  <label style={editLabelStyle}>Host name(s)</label>
                  <input type="text" value={editForm.hostNames} onChange={e => setEditForm(p => ({ ...p, hostNames: e.target.value }))} placeholder="Rob & Lisa Knox" style={editInputStyle} />
                </div>
                <div>
                  <label style={editLabelStyle}>Theme / vibe</label>
                  <input type="text" value={editForm.theme} onChange={e => setEditForm(p => ({ ...p, theme: e.target.value }))} placeholder="A midsummer garden dinner" style={editInputStyle} />
                </div>
              </div>

              {/* Event image */}
              <div>
                <label style={editLabelStyle}>Event image</label>
                {heroPreview && (
                  <img
                    src={heroPreview}
                    alt="Event"
                    style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 6, display: 'block', marginBottom: 10 }}
                  />
                )}
                <label style={{ display: 'block', cursor: 'pointer' }}>
                  <div style={{ border: '1px dashed var(--wcs-cream-dark)', borderRadius: 6, padding: '12px 16px', background: 'var(--wcs-cream)', textAlign: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui' }}>
                      {heroPreview ? 'Replace image' : 'Upload image'}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--wcs-green-muted)', marginTop: 3, fontFamily: 'Inter, system-ui' }}>
                      1280 × 560 px recommended · JPEG or PNG · max 10 MB
                    </span>
                  </div>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleHeroChange} style={{ display: 'none' }} />
                </label>
                {imageError && <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 5, fontFamily: 'Inter, system-ui' }}>{imageError}</p>}
              </div>

              <div>
                <label style={editLabelStyle}>Description</label>
                <textarea rows={3} value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} style={{ ...editInputStyle, resize: 'vertical' }} />
              </div>

              <div>
                <label style={editLabelStyle}>
                  What to expect
                  <span style={{ color: 'var(--wcs-green-muted)', marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>{editForm.what_to_expect?.length || 0}/280</span>
                </label>
                <textarea rows={3} value={editForm.what_to_expect} onChange={e => setEditForm(p => ({ ...p, what_to_expect: e.target.value.slice(0, 280) }))} style={{ ...editInputStyle, resize: 'vertical' }} />
              </div>

              {saveError && <p style={{ fontSize: 13, color: '#b91c1c', margin: 0 }}>{saveError}</p>}

              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button type="submit" disabled={saving} style={{ flex: 1, padding: '14px', background: saving ? 'var(--wcs-cream-dark)' : 'var(--wcs-green-dark)', color: 'var(--wcs-cream)', border: 'none', borderRadius: 6, fontFamily: 'Inter, system-ui', fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" onClick={() => setEditMode(false)} style={{ padding: '14px 24px', background: 'transparent', color: 'var(--wcs-green-dark)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, fontFamily: 'Inter, system-ui', fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  )
}

const editLabelStyle = {
  display: 'block', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em',
  textTransform: 'uppercase', color: 'var(--wcs-copper)', marginBottom: 5,
  fontFamily: 'Inter, system-ui',
}

const editInputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--wcs-cream-dark)',
  borderRadius: 6, background: 'var(--wcs-cream)', fontFamily: 'Inter, system-ui',
  fontSize: 14, color: 'var(--wcs-green-dark)', boxSizing: 'border-box', outline: 'none',
}

function HostRsvpSummary({ guests }) {
  const counts = guests.reduce((acc, g) => {
    const s = g.rsvp_status || 'no_response'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})
  const items = [
    { key: 'attending',  label: 'Attending',    color: 'var(--wcs-green-dark)' },
    { key: 'maybe',      label: 'Maybe',         color: 'var(--wcs-copper)' },
    { key: 'declined',   label: 'Declined',      color: '#999' },
    { key: 'no_response',label: 'No response',   color: '#bbb' },
  ].filter(i => counts[i.key])
  if (!guests.length) return (
    <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>
      No guests invited yet.
    </p>
  )
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
      {items.map(({ key, label, color }) => (
        <div key={key} style={{ textAlign: 'center', minWidth: 72, padding: '14px 20px', background: 'var(--wcs-white)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 300, color, fontFamily: 'Inter, system-ui', lineHeight: 1 }}>{counts[key]}</div>
          <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginTop: 4 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

function RsvpForm({ selectedStatus, setSelectedStatus, dietaryNotes, setDietaryNotes, onSubmit, submitting, error }) {
  return (
    <div>
      <h2 className="text-center font-serif" style={{ fontSize: 22, color: 'var(--wcs-green-dark)', marginBottom: 24 }}>
        Will you be joining us?
      </h2>

      <form onSubmit={onSubmit}>
        {/* RSVP buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {RSVP_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSelectedStatus(value)}
              style={{
                flex: 1,
                minWidth: 100,
                padding: '12px 16px',
                borderRadius: 6,
                border: `1px solid ${selectedStatus === value ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)'}`,
                background: selectedStatus === value ? 'var(--wcs-green-dark)' : 'transparent',
                color: selectedStatus === value ? 'var(--wcs-cream)' : 'var(--wcs-green-dark)',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Dietary notes */}
        {selectedStatus && selectedStatus !== 'declined' && (
          <textarea
            value={dietaryNotes}
            onChange={e => setDietaryNotes(e.target.value)}
            placeholder="Any dietary notes for the host?"
            rows={3}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: '1px solid var(--wcs-cream-dark)',
              borderRadius: 6,
              background: 'var(--wcs-white)',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 14,
              color: 'var(--wcs-green-dark)',
              resize: 'vertical',
              marginBottom: 16,
              boxSizing: 'border-box',
            }}
          />
        )}

        {error && (
          <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!selectedStatus || submitting}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: 280,
            margin: '0 auto',
            padding: '14px 40px',
            background: selectedStatus && !submitting ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)',
            color: 'var(--wcs-cream)',
            border: 'none',
            borderRadius: 6,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: selectedStatus && !submitting ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? 'Sending…' : "Yes, I'll be there"}
        </button>
      </form>
    </div>
  )
}

function ConfirmationBlock({ rsvpStatus, onUpdate, icsUrl }) {
  const copy = CONFIRMATION[rsvpStatus] || CONFIRMATION.attending
  return (
    <div className="text-center">
      <CopperRule />
      <p className="font-serif" style={{ fontSize: 20, color: 'var(--wcs-green-dark)', marginBottom: 8 }}>
        {copy.heading()}
      </p>
      <p style={{ fontSize: 13, color: 'var(--wcs-green-light)', marginBottom: 16 }}>
        {copy.sub}
      </p>
      {icsUrl && (
        <a
          href={icsUrl}
          style={{ display: 'block', fontSize: 12, color: 'var(--wcs-copper)', marginBottom: 16, letterSpacing: '0.04em', fontFamily: 'Inter, system-ui', textDecoration: 'none' }}
        >
          Add this evening to your calendar
        </a>
      )}
      <button
        onClick={onUpdate}
        style={{ fontSize: 11, color: 'var(--wcs-green-muted)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.05em', textDecoration: 'underline' }}
      >
        Update my RSVP
      </button>
    </div>
  )
}

function BringListGuest({ eventId, guestId, token }) {
  const [items, setItems]           = useState([])
  const [claims, setClaims]         = useState([])
  const [myClaim, setMyClaim]       = useState(null)
  const [claiming, setClaiming]     = useState(null)
  const [claimError, setClaimError] = useState('')

  const fetchData = useCallback(async () => {
    const { data: itemsData } = await supabase
      .from('bring_list_items')
      .select('id, category, label, slots_total')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })

    if (!itemsData?.length) { setItems([]); setClaims([]); return }
    setItems(itemsData)

    const { data: claimsData } = await supabase
      .from('bring_list_claims')
      .select('id, item_id, guest_id')
      .in('item_id', itemsData.map(i => i.id))

    setClaims(claimsData || [])
    const mine = (claimsData || []).find(c => c.guest_id === guestId)
    setMyClaim(mine || null)
  }, [eventId, guestId])

  useEffect(() => {
    fetchData()

    // Realtime subscription
    const channel = supabase
      .channel(`bring-list-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bring_list_claims' }, fetchData)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchData, eventId])

  async function handleClaim(itemId) {
    setClaiming(itemId)
    setClaimError('')
    try {
      const res = await fetch('/api/claim-bring-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, itemId }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'already_claimed') {
          setClaimError(`You've already claimed: ${data.claimedLabel || 'an item'}`)
        } else {
          setClaimError(data.error || 'Could not claim this item')
        }
      }
      // fetchData will be triggered by realtime
      await fetchData()
    } catch {
      setClaimError('Something went wrong. Please try again.')
    } finally {
      setClaiming(null)
    }
  }

  if (items.length === 0) return null

  const itemsByCategory = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  return (
    <div>
      <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '0 auto 24px' }} />
      <h2 className="font-serif text-center" style={{ fontSize: 22, color: 'var(--wcs-green-dark)', marginBottom: 6 }}>
        What will you bring to the table?
      </h2>
      {myClaim ? (
        <p className="text-center" style={{ fontSize: 13, color: 'var(--wcs-green-light)', marginBottom: 20 }}>
          You're bringing: <strong style={{ color: 'var(--wcs-green-dark)' }}>{items.find(i => i.id === myClaim.item_id)?.label}</strong>
        </p>
      ) : (
        <p className="text-center" style={{ fontSize: 13, color: 'var(--wcs-green-light)', marginBottom: 20 }}>
          Choose one item to bring to the table.
        </p>
      )}

      {claimError && (
        <p className="text-center" style={{ fontSize: 13, color: '#b91c1c', marginBottom: 12 }}>{claimError}</p>
      )}

      <div style={{ background: 'var(--wcs-white)', borderRadius: 10, border: '1px solid var(--wcs-cream-dark)', overflow: 'hidden' }}>
        {Object.entries(itemsByCategory).map(([category, catItems]) => (
          <div key={category}>
            <div style={{ padding: '10px 20px', background: 'var(--wcs-cream-mid)' }}>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui' }}>{category}</span>
            </div>
            {catItems.map((item, i) => {
              const itemClaims = claims.filter(c => c.item_id === item.id)
              const available  = itemClaims.length < item.slots_total
              const isMine     = myClaim?.item_id === item.id

              return (
                <div key={item.id} style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '0.5px solid var(--wcs-cream-dark)', background: i % 2 === 0 ? 'var(--wcs-white)' : 'var(--wcs-cream-mid)' }}>
                  <div>
                    <span style={{ fontSize: 13, fontFamily: 'Inter, system-ui', color: 'var(--wcs-green-dark)' }}>{item.label}</span>
                    <span style={{ fontSize: 11, fontFamily: 'Inter, system-ui', color: available ? 'var(--wcs-copper)' : 'var(--wcs-green-muted)', marginLeft: 10 }}>
                      {available ? `${item.slots_total - itemClaims.length} open` : 'Claimed'}
                    </span>
                  </div>
                  {isMine ? (
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui', letterSpacing: '0.05em' }}>✓ You</span>
                  ) : !myClaim && available ? (
                    <button
                      onClick={() => handleClaim(item.id)}
                      disabled={claiming === item.id}
                      style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wcs-green-dark)', background: 'none', border: '1px solid var(--wcs-cream-dark)', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontFamily: 'Inter, system-ui' }}
                    >
                      {claiming === item.id ? '…' : 'Claim your contribution'}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

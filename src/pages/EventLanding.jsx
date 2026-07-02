import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import FromTheTable from '../components/FromTheTable'
import ForTheTable from '../components/ForTheTable'

const EVENT_TIMEZONE = 'America/Los_Angeles'

function formatForDatetimeInput(utcString) {
  if (!utcString) return ''
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: EVENT_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(utcString)).replace(' ', 'T')
}

function pacificInputToUtc(localStr) {
  if (!localStr) return null
  const approx = new Date(localStr + ':00Z')
  const pacificStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: EVENT_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(approx).replace(' ', 'T')
  const offsetMs = approx.getTime() - new Date(pacificStr + ':00Z').getTime()
  return new Date(approx.getTime() + offsetMs).toISOString()
}

function formatDateLabel(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).toUpperCase()
}

function formatDateShort(dateStr) {
  if (!dateStr) return 'that day'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  })
}

function formatRsvpDeadline(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr.slice(0, 10) + 'T12:00:00')
  if (isNaN(d)) return null
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
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

const STATUS_LABEL = {
  attending:   'Attending',
  maybe:       'I Hope to Make It',
  declined:    'Send My Regrets',
  no_response: 'Awaiting Word',
}
const STATUS_COLOR = {
  attending:   '#2c4a2e',
  maybe:       'var(--wcs-copper)',
  declined:    '#999',
  no_response: '#bbb',
}
const STATUS_ORDER = { attending: 0, maybe: 1, declined: 2, no_response: 3 }

const NUMBER_WORDS = ['One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
  'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen','Twenty']
function spellNumber(n) {
  if (n >= 1 && n <= 20) return NUMBER_WORDS[n - 1]
  return String(n)
}

function countdownLabel(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const event = new Date(dateStr + 'T00:00:00')
  event.setHours(0, 0, 0, 0)
  const diff = Math.round((event - today) / (1000 * 60 * 60 * 24))
  if (diff < 0) return null
  if (diff === 0) return 'This evening'
  if (diff === 1) return 'Tomorrow'
  return `${spellNumber(diff)} days away`
}

function formatStartTime(timestamptz) {
  if (!timestamptz) return null
  return new Date(timestamptz).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: EVENT_TIMEZONE,
  })
}

function formatDateRange(startDateStr, endDateStr) {
  const start = new Date(startDateStr + 'T12:00:00')
  const end   = new Date(endDateStr   + 'T12:00:00')
  const opts  = { timeZone: 'America/Los_Angeles' }
  const sm = start.toLocaleDateString('en-US', { month: 'long', ...opts })
  const em = end.toLocaleDateString('en-US',   { month: 'long', ...opts })
  const sd = start.toLocaleDateString('en-US', { day: 'numeric', ...opts })
  const ed = end.toLocaleDateString('en-US',   { day: 'numeric', ...opts })
  return sm === em ? `${sm} ${sd}–${ed}` : `${sm} ${sd} – ${em} ${ed}`
}

const CONFIRMATION = {
  attending: { heading: () => "We'll set a place for you.",          sub: 'A note has been sent to your inbox.' },
  maybe:     { heading: () => 'We hope the evening finds you free.', sub: 'A note has been sent to your inbox.' },
  declined:  { heading: () => "We're sorry to miss you this time.",  sub: 'We hope to share a table another evening.' },
}

export default function EventLanding() {
  const { eventId } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [event, setEvent]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [guest, setGuest]               = useState(null)
  const [guestLoading, setGuestLoading] = useState(false)

  const [selectedStatus, setSelectedStatus] = useState(null)
  const [dietaryNotes, setDietaryNotes]     = useState('')
  const [guestCount, setGuestCount]         = useState(1)
  const [submitting, setSubmitting]         = useState(false)
  const [rsvpError, setRsvpError]           = useState('')
  const [submitted, setSubmitted]           = useState(false)

  const [isHost, setIsHost]         = useState(false)
  const [hostUserId, setHostUserId] = useState(null)
  const [editMode, setEditMode]     = useState(false)
  const [editForm, setEditForm]     = useState({})
  const [newHeroImage, setNewHeroImage] = useState(null)
  const [heroPreview, setHeroPreview]   = useState(null)
  const [imageError, setImageError]     = useState('')
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')

  const [hostGuests, setHostGuests]           = useState([])
  const [guestFilter, setGuestFilter]         = useState('all')
  const [guestSort, setGuestSort]             = useState({ col: 'status', dir: 'asc' })
  const [guestListOpen, setGuestListOpen]     = useState(false)
  const [hostBringList, setHostBringList]     = useState([])
  const [hostBringClaims, setHostBringClaims] = useState([])
  const [addGuestText, setAddGuestText]       = useState('')
  const [addGuestSending, setAddGuestSending] = useState(false)
  const [addGuestResult, setAddGuestResult]   = useState(null)
  const [addGuestError, setAddGuestError]     = useState('')
  const [removeConfirmId, setRemoveConfirmId] = useState(null)

  const [galleryOpening, setGalleryOpening]   = useState(null)
  const [galleryOpenError, setGalleryOpenError] = useState('')

  const [hostContributions, setHostContributions]     = useState([])
  const [newHostItem, setNewHostItem]                 = useState('')
  const [addingHostItem, setAddingHostItem]           = useState(false)
  const [hostItemError, setHostItemError]             = useState('')
  const [forTheTableKey, setForTheTableKey]           = useState(0)

  const [blastSubject, setBlastSubject] = useState('')
  const [blastNote, setBlastNote]       = useState('')
  const [blastConfirm, setBlastConfirm] = useState(false)
  const [blastSending, setBlastSending] = useState(false)
  const [blastResult, setBlastResult]   = useState(null)
  const [blastError, setBlastError]     = useState('')

  const [walkInName, setWalkInName]         = useState('')
  const [walkInEmail, setWalkInEmail]       = useState('')
  const [walkInSubmitting, setWalkInSubmitting] = useState(false)
  const [walkInError, setWalkInError]       = useState('')
  const [walkInToken, setWalkInToken]       = useState(null)
  const [walkInOptIn, setWalkInOptIn]       = useState(false)
  const [authChecked, setAuthChecked]       = useState(false)

  const activeToken = token || walkInToken

  const [attendingCount, setAttendingCount] = useState(0)
  const [attendingNames, setAttendingNames] = useState(null)

  const fetchGuestList = useCallback(async (tokenToUse) => {
    const params = new URLSearchParams({ eventId })
    if (tokenToUse) params.set('token', tokenToUse)
    try {
      const res = await fetch(`/api/guest-list?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setAttendingCount(data.attendingCount || 0)
      setAttendingNames(data.names || null)
    } catch {}
  }, [eventId])

  useEffect(() => {
    supabase
      .from('events')
      .select('id, name, date, description, vibe, theme, dress_code, what_to_expect, rsvp_deadline, location, host_id, pre_gallery_open, post_gallery_open, guest_list_reveal_date, start_time, end_time, all_day, multi_day_end, end_line, details, event_type')
      .eq('id', eventId)
      .single()
      .then(async ({ data, error }) => {
        if (error || !data) { setNotFound(true); setLoading(false); return }
        setEvent(data)
        setLoading(false)
        fetchGuestList(undefined)

        if (!token) {
          const storedToken = localStorage.getItem('wcs_guest_token')
          if (storedToken) {
            try {
              const r = await fetch('/api/validate-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: storedToken }),
              })
              const tokenData = await r.json()
              if (tokenData.valid && tokenData.eventId === eventId) {
                setWalkInToken(storedToken)
                fetchGuestList(storedToken)
                setGuest(tokenData)
                if (tokenData.rsvpStatus && tokenData.rsvpStatus !== 'no_response') {
                  setSelectedStatus(tokenData.rsvpStatus)
                  setDietaryNotes(tokenData.dietaryNotes || '')
                  setGuestCount(tokenData.guestCount || 1)
                  setSubmitted(true)
                }
              } else if (!tokenData.valid) {
                localStorage.removeItem('wcs_guest_token')
              }
            } catch {}
          }
        }

        const { data: { user } } = await supabase.auth.getUser()
        const eventData = data
        if (user && user.id === eventData.host_id) {
          setIsHost(true)
          setHostUserId(user.id)

          const { data: guestsData } = await supabase
            .from('guests')
            .select('id, rsvp_status, dietary_notes, guest_count, contacts(name, email, phone)')
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
        setAuthChecked(true)
      })
  }, [eventId])

  function openEdit() {
    const { hostNames, heroImageUrl } = parseVibe(event.vibe)
    setEditForm({
      name:           event.name || '',
      date:           event.date ? event.date.slice(0, 10) : '',
      event_type:     (event.event_type && event.event_type !== 'gathering') ? event.event_type : '',
      description:    event.description || event.what_to_expect || '',
      hostNames:      hostNames || '',
      theme:          event.theme || '',
      location:       event.location || '',
      dress_code:     event.dress_code || '',
      rsvp_deadline:  event.rsvp_deadline || '',
      guest_list_reveal_date: event.guest_list_reveal_date || '',
      start_time:     formatForDatetimeInput(event.start_time),
      end_time:       formatForDatetimeInput(event.end_time),
      all_day:        event.all_day || false,
      multi_day_end:  event.multi_day_end || '',
      end_line:       event.end_line || 'until the last bottle is empty',
      details:        event.details || '',
    })
    setNewHeroImage(null)
    setHeroPreview(heroImageUrl || null)
    setImageError('')
    setSaveError('')
    fetch(`/api/get-table-contributions?eventId=${event.id}`)
      .then(r => r.json())
      .then(d => setHostContributions((d.contributions || []).filter(c => c.is_host_provided)))
      .catch(() => {})
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
        if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`)
        const { data: { publicUrl } } = supabase.storage.from('event-images').getPublicUrl(path)
        heroImageUrl = publicUrl
      }

      const newVibe = JSON.stringify({ ...currentVibe, hostNames: editForm.hostNames, heroImageUrl })
      const { data: updated, error } = await supabase
        .from('events')
        .update({
          name:           editForm.name,
          date:           editForm.date || event.date,
          event_type:     editForm.event_type || null,
          description:    editForm.description || null,
          what_to_expect: null,
          vibe:           newVibe,
          theme:          editForm.theme || null,
          location:       editForm.location || null,
          dress_code:     editForm.dress_code || null,
          rsvp_deadline:  editForm.rsvp_deadline || null,
          guest_list_reveal_date: editForm.guest_list_reveal_date || null,
          start_time:     pacificInputToUtc(editForm.start_time),
          end_time:       pacificInputToUtc(editForm.end_time),
          all_day:        editForm.all_day || false,
          multi_day_end:  editForm.multi_day_end || null,
          end_line:       editForm.end_line || null,
          details:        editForm.details || null,
        })
        .eq('id', event.id)
        .select('id, name, date, description, vibe, theme, dress_code, what_to_expect, rsvp_deadline, location, host_id, guest_list_reveal_date, start_time, end_time, all_day, multi_day_end, end_line, details, event_type, pre_gallery_open, post_gallery_open')
        .single()
      if (error) throw new Error(error.message)
      setEvent(updated)
      setEditMode(false)
    } catch (err) {
      setSaveError(err.message || 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const channel = supabase
      .channel(`guests-count-${eventId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'guests',
        filter: `event_id=eq.${eventId}`,
      }, () => fetchGuestList(undefined))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventId, fetchGuestList])

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
            setGuestCount(data.guestCount || 1)
            setSubmitted(true)
          }
        }
      })
      .catch(() => {})
      .finally(() => { setGuestLoading(false); fetchGuestList(token) })
  }, [token, fetchGuestList])

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
        body: JSON.stringify({ token: activeToken, rsvpStatus: selectedStatus, dietaryNotes, guestCount, appUrl }),
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
      .map(email => ({ email }))
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
      const { data: guestsData } = await supabase
        .from('guests')
        .select('id, rsvp_status, dietary_notes, guest_count, contacts(name, email)')
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
        pre_gallery_open:  phase === 'pre'  ? true : prev.pre_gallery_open,
        post_gallery_open: phase === 'post' ? true : prev.post_gallery_open,
      }))
    } catch (err) {
      setGalleryOpenError(err.message)
    } finally {
      setGalleryOpening(null)
    }
  }

  async function handleRemoveGuest(guestId) {
    await supabase.from('guests').delete().eq('id', guestId)
    setHostGuests(prev => prev.filter(g => g.id !== guestId))
    setRemoveConfirmId(null)
  }

  async function handleWalkInSubmit(e) {
    e.preventDefault()
    if (!selectedStatus || !walkInName.trim()) return
    setWalkInSubmitting(true)
    setWalkInError('')
    try {
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin
      const res = await fetch('/api/walk-in-rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId, name: walkInName.trim(), email: walkInEmail.trim() || null,
          rsvpStatus: selectedStatus, dietaryNotes, guestCount,
          optIn: walkInOptIn, appUrl,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit RSVP')
      setWalkInToken(data.token)
      localStorage.setItem('wcs_guest_token', data.token)
      fetchGuestList(data.token)
      setGuest({ valid: true, guestId: data.guestId, rsvpStatus: data.rsvpStatus, guestName: data.guestName, guestEmail: data.guestEmail })
      setSubmitted(true)
    } catch (err) {
      setWalkInError(err.message)
    } finally {
      setWalkInSubmitting(false)
    }
  }

  async function handleBlast(e) {
    e.preventDefault()
    if (!blastSubject.trim() || !blastNote.trim()) return
    setBlastSending(true)
    setBlastError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/event-blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ eventId: event.id, subject: blastSubject, note: blastNote }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setBlastResult(data)
      setBlastConfirm(false)
      setBlastSubject('')
      setBlastNote('')
    } catch (err) {
      setBlastError(err.message || 'Could not send update.')
    } finally {
      setBlastSending(false)
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
  const dateLabel  = event.multi_day_end
    ? formatDateRange(event.date, event.multi_day_end).toUpperCase()
    : formatDateLabel(event.date)
  const countdown  = countdownLabel(event.date)
  const startTime  = !event.all_day ? formatStartTime(event.start_time) : null
  const endTime    = !event.all_day && event.end_time ? formatStartTime(event.end_time) : null
  const endLine    = event.end_line || 'until the last bottle is empty'
  const description = event.description || event.what_to_expect || null
  const eventTypeLabel = event.event_type && event.event_type !== 'gathering' ? event.event_type.toUpperCase() : null
  const isConfirmedGuest = submitted && (selectedStatus === 'attending' || selectedStatus === 'maybe') && guest
  const showGalleries = isHost || isConfirmedGuest
  const mapsUrl = event.location ? `https://maps.google.com/?q=${encodeURIComponent(event.location)}` : null

  return (
    <div className="min-h-screen" style={{ background: 'var(--wcs-cream)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 60px' }}>

        {/* Logo + host controls */}
        <div style={{ position: 'relative', textAlign: 'center' }}>
          <Link to={isHost ? '/dashboard' : guest ? '/my-invitations' : '/dashboard'} style={{ display: 'inline-block', lineHeight: 0 }}>
            <img src="/wcs_logo.png" alt="Woodinville Cookery Society" style={{ width: 140, height: 'auto', display: 'inline-block' }} />
          </Link>
          {isHost && (
            <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <button
                onClick={openEdit}
                style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', background: 'none', border: '1px solid var(--wcs-cream-dark)', borderRadius: 4, padding: '5px 10px', cursor: 'pointer', fontFamily: 'Inter, system-ui' }}
              >
                Edit
              </button>
              <Link to="/dashboard" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-copper)', textDecoration: 'underline', fontFamily: 'Inter, system-ui' }}>
                ← Dashboard
              </Link>
            </div>
          )}
        </div>

        <CopperRule />

        {/* 1. Hero image */}
        <div style={{ marginBottom: 24 }}>
          <img
            key={heroImageUrl || 'placeholder'}
            src={heroImageUrl || '/eventimageplaceholder.png'}
            alt={event.name}
            onError={e => { e.target.src = '/eventimageplaceholder.png'; e.target.style.objectFit = 'contain'; e.target.style.borderRadius = '0' }}
            style={{ width: '100%', maxHeight: 280, objectFit: heroImageUrl ? 'cover' : 'contain', display: 'block', ...(heroImageUrl ? { borderRadius: 10 } : {}) }}
          />
        </div>

        {/* 2. Event type label (optional) */}
        {eventTypeLabel && (
          <p className="text-center" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', marginBottom: 8, fontFamily: 'Inter, system-ui' }}>
            {eventTypeLabel}
          </p>
        )}

        {/* Event name */}
        <h1 className="text-center font-serif" style={{ fontSize: 32, color: 'var(--wcs-green-dark)', marginTop: eventTypeLabel ? 0 : 8, lineHeight: 1.25, marginBottom: 0 }}>
          {event.name}
        </h1>

        {/* 3. Who / When / Where */}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          {hostNames && (
            <p style={{ fontSize: 13, color: 'var(--wcs-green-light)', marginBottom: 3 }}>Hosted by {hostNames}</p>
          )}
          <p style={{ fontSize: 13, color: 'var(--wcs-green-light)', marginBottom: 3, fontFamily: 'Inter, system-ui', letterSpacing: '0.02em' }}>
            {dateLabel}
            {startTime && <span style={{ marginLeft: 8 }}>· {endTime ? `${startTime} – ${endTime}` : `${startTime} — ${endLine}`}</span>}
          </p>
          {event.location && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', textDecoration: 'underline', display: 'inline-block' }}
            >
              {event.location}
            </a>
          )}
          {event.dress_code && (
            <div style={{ marginTop: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-green-dark)', background: 'var(--wcs-cream-mid)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 4, padding: '5px 12px', fontFamily: 'Inter, system-ui' }}>
                {event.dress_code}
              </span>
            </div>
          )}
          {event.rsvp_deadline && (
            <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-copper)', marginTop: 12, fontFamily: 'Inter, system-ui' }}>
              Please respond by {formatRsvpDeadline(event.rsvp_deadline)}
            </p>
          )}
        </div>

        <CopperRule />

        {/* RSVP section */}
        <div style={{ marginTop: 8 }}>
          {guestLoading ? (
            <div className="text-center py-8">
              <div className="w-5 h-5 border-2 rounded-full animate-spin inline-block" style={{ borderColor: 'var(--wcs-cream-dark)', borderTopColor: 'var(--wcs-green-dark)' }} />
            </div>
          ) : guest ? (
            submitted ? (
              <ConfirmationBlock
                rsvpStatus={selectedStatus}
                onUpdate={() => setSubmitted(false)}
                icsUrl={selectedStatus !== 'declined' ? `/api/generate-ics?eventId=${eventId}&token=${activeToken}` : null}
                hasEmail={!!guest?.guestEmail}
              />
            ) : (
              <RsvpForm
                selectedStatus={selectedStatus}
                setSelectedStatus={setSelectedStatus}
                dietaryNotes={dietaryNotes}
                setDietaryNotes={setDietaryNotes}
                guestCount={guestCount}
                setGuestCount={setGuestCount}
                onSubmit={handleRsvpSubmit}
                submitting={submitting}
                error={rsvpError}
              />
            )
          ) : token ? (
            <p className="text-center" style={{ fontSize: 13, color: 'var(--wcs-green-muted)', letterSpacing: '0.05em' }}>
              This invitation link is no longer valid.
            </p>
          ) : !authChecked || isHost ? null : (
            <WalkInRsvpForm
              selectedStatus={selectedStatus}
              setSelectedStatus={setSelectedStatus}
              dietaryNotes={dietaryNotes}
              setDietaryNotes={setDietaryNotes}
              guestCount={guestCount}
              setGuestCount={setGuestCount}
              walkInName={walkInName}
              setWalkInName={setWalkInName}
              walkInEmail={walkInEmail}
              setWalkInEmail={setWalkInEmail}
              walkInOptIn={walkInOptIn}
              setWalkInOptIn={setWalkInOptIn}
              onSubmit={handleWalkInSubmit}
              submitting={walkInSubmitting}
              error={walkInError}
            />
          )}
        </div>

        {/* Attending count / names — non-host social proof */}
        {!isHost && attendingCount > 0 && (
          <div style={{ textAlign: 'center', marginTop: 28 }}>
            {attendingNames?.length > 0 ? (
              <>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', marginBottom: 10, fontFamily: 'Inter, system-ui' }}>
                  Those joining the table
                </p>
                <p style={{ fontSize: 14, color: 'var(--wcs-green-mid)', lineHeight: 2, fontFamily: 'Inter, system-ui', margin: 0 }}>
                  {attendingNames.join(' · ')}
                </p>
              </>
            ) : (
              <p className="font-serif" style={{ fontSize: 16, color: 'var(--wcs-green-light)', fontStyle: 'italic', margin: 0 }}>
                {spellNumber(attendingCount)} {attendingCount === 1 ? 'has' : 'have'} saved their seat.
              </p>
            )}
          </div>
        )}

        {/* 4. Description (merged field) */}
        {description && (
          <div style={{ marginTop: 32 }}>
            <p style={{ fontSize: 15, color: 'var(--wcs-green-mid)', lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: 0 }}>
              {description}
            </p>
          </div>
        )}

        {/* Details block */}
        {event.details && (
          <div style={{ marginTop: 28, borderTop: '0.5px solid var(--wcs-cream-dark)', paddingTop: 24 }}>
            <p className="font-serif" style={{ fontSize: 15, color: 'var(--wcs-green-mid)', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>
              {event.details}
            </p>
          </div>
        )}

        {/* 5. For the Table */}
        {(isHost || isConfirmedGuest) && (
          <ForTheTable
            key={forTheTableKey}
            eventId={eventId}
            isHost={isHost}
            hostUserId={hostUserId}
            guestToken={activeToken}
            guestRsvpId={guest?.guestId}
          />
        )}

        {/* 7. Guest list */}
        {isHost && (
          <div style={{ marginTop: 44 }}>
            <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '0 auto 24px' }} />

            {/* RSVP summary counts */}
            <HostRsvpSummary guests={hostGuests} />

            {/* Collapsible guest table */}
            {hostGuests.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <button
                  onClick={() => setGuestListOpen(o => !o)}
                  style={{ display: 'block', width: '100%', textAlign: 'center', fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, system-ui', padding: '10px 0' }}
                >
                  {guestListOpen ? 'Hide guest list ↑' : 'See who\'s coming ↓'}
                </button>

                {guestListOpen && (() => {
                  const ACTIVE_STATUSES = ['attending', 'maybe', 'declined']
                  const filtered = guestFilter === 'all'
                    ? hostGuests
                    : guestFilter === 'no_response'
                      ? hostGuests.filter(g => !ACTIVE_STATUSES.includes(g.rsvp_status))
                      : hostGuests.filter(g => g.rsvp_status === guestFilter)
                  const sorted = [...filtered].sort((a, b) => {
                    const dir = guestSort.dir === 'asc' ? 1 : -1
                    if (guestSort.col === 'name') {
                      const na = (a.contacts?.name || a.contacts?.email || '').toLowerCase()
                      const nb = (b.contacts?.name || b.contacts?.email || '').toLowerCase()
                      return dir * na.localeCompare(nb)
                    }
                    const sa = STATUS_ORDER[a.rsvp_status || 'no_response'] ?? 3
                    const sb = STATUS_ORDER[b.rsvp_status || 'no_response'] ?? 3
                    return dir * (sa - sb)
                  })
                  const colHdrStyle = { fontSize: 9, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, system-ui', display: 'flex', alignItems: 'center', gap: 3 }
                  const sortIcon = col => guestSort.col === col ? (guestSort.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
                  const FILTER_OPTIONS = [
                    { value: 'all',         label: 'All' },
                    { value: 'attending',   label: 'Attending' },
                    { value: 'maybe',       label: 'I Hope to Make It' },
                    { value: 'declined',    label: 'Send My Regrets' },
                    { value: 'no_response', label: 'Awaiting Word' },
                  ]
                  return (
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 10 }}>
                        Guest list
                      </p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                        {FILTER_OPTIONS.map(opt => (
                          <button key={opt.value} onClick={() => setGuestFilter(opt.value)} style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Inter, system-ui', padding: '4px 10px', borderRadius: 20, border: '1px solid', cursor: 'pointer', background: guestFilter === opt.value ? 'var(--wcs-green-dark)' : 'transparent', color: guestFilter === opt.value ? 'var(--wcs-cream)' : 'var(--wcs-green-muted)', borderColor: guestFilter === opt.value ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)' }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ border: '1px solid var(--wcs-cream-dark)', borderRadius: 8, overflow: 'hidden', background: 'var(--wcs-white)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 16px', background: 'var(--wcs-cream-mid)', borderBottom: '0.5px solid var(--wcs-cream-dark)' }}>
                          <button style={colHdrStyle} onClick={() => setGuestSort(p => ({ col: 'name', dir: p.col === 'name' && p.dir === 'asc' ? 'desc' : 'asc' }))}>
                            Name{sortIcon('name')}
                          </button>
                          <button style={colHdrStyle} onClick={() => setGuestSort(p => ({ col: 'status', dir: p.col === 'status' && p.dir === 'asc' ? 'desc' : 'asc' }))}>
                            Status{sortIcon('status')}
                          </button>
                        </div>
                        {sorted.length === 0 ? (
                          <p style={{ textAlign: 'center', padding: '20px 16px', fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', margin: 0 }}>No guests with this status.</p>
                        ) : sorted.map((g, i) => {
                          const rowName = g.contacts?.name || g.contacts?.email || g.contacts?.phone || 'this guest'
                          const rowBase = { borderTop: i > 0 ? '0.5px solid var(--wcs-cream-dark)' : 'none', background: i % 2 === 0 ? 'var(--wcs-white)' : 'var(--wcs-cream-mid)' }
                          if (removeConfirmId === g.id) {
                            return (
                              <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', ...rowBase, background: '#fff5f5' }}>
                                <span style={{ fontSize: 13, fontFamily: 'Inter, system-ui', color: '#b91c1c' }}>Remove {rowName}?</span>
                                <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                                  <button onClick={() => handleRemoveGuest(g.id)} style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#b91c1c', background: 'none', border: '1px solid #b91c1c', borderRadius: 4, padding: '5px 12px', cursor: 'pointer', fontFamily: 'Inter, system-ui' }}>Remove</button>
                                  <button onClick={() => setRemoveConfirmId(null)} style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', background: 'none', border: '1px solid var(--wcs-cream-dark)', borderRadius: 4, padding: '5px 12px', cursor: 'pointer', fontFamily: 'Inter, system-ui' }}>Cancel</button>
                                </div>
                              </div>
                            )
                          }
                          return (
                            <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', ...rowBase }}>
                              <div>
                                <span style={{ fontSize: 13, fontFamily: 'Inter, system-ui', color: 'var(--wcs-green-dark)', fontWeight: 500 }}>{rowName}</span>
                                {g.contacts?.name && g.contacts?.email && (
                                  <span style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginLeft: 8 }}>{g.contacts.email}</span>
                                )}
                                {g.contacts?.phone && !g.contacts?.email && (
                                  <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wcs-copper)', background: '#f5ede5', padding: '2px 6px', borderRadius: 3, marginLeft: 8, fontFamily: 'Inter, system-ui' }}>SMS</span>
                                )}
                                {g.dietary_notes && (
                                  <p style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', margin: '2px 0 0' }}>Note: {g.dietary_notes}</p>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 12 }}>
                                <div style={{ textAlign: 'right' }}>
                                  <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: STATUS_COLOR[g.rsvp_status || 'no_response'], fontFamily: 'Inter, system-ui' }}>
                                    {STATUS_LABEL[g.rsvp_status || 'no_response']}
                                  </span>
                                  {(g.rsvp_status === 'attending' || g.rsvp_status === 'maybe') && (g.guest_count || 1) > 0 && (
                                    <p style={{ fontSize: 10, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', margin: '2px 0 0' }}>
                                      {g.guest_count || 1} {(g.guest_count || 1) === 1 ? 'guest' : 'guests'}
                                    </p>
                                  )}
                                </div>
                                <button onClick={() => setRemoveConfirmId(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--wcs-green-muted)', lineHeight: 0, borderRadius: 4 }}>
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M1.75 3.5h10.5M5.25 3.5V2.333A.583.583 0 0 1 5.833 1.75h2.334A.583.583 0 0 1 8.75 2.333V3.5m-5.833 0 .583 8.167a.583.583 0 0 0 .583.583h5.834a.583.583 0 0 0 .583-.583L11.083 3.5H2.917Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Bring list claims */}
                      {hostBringList.length > 0 && (
                        <div style={{ marginTop: 24 }}>
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
                                    {claimedBy && <p style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', margin: '2px 0 0' }}>{claimedBy}</p>}
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
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {/* 8. From the table */}
        {(isHost || isConfirmedGuest) && (
          <div style={{ marginTop: 44 }}>
            <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '0 auto 28px' }} />
            <FromTheTable
              eventId={eventId}
              isHost={isHost}
              hostUserId={hostUserId}
              guestToken={activeToken}
              guestName={guest?.guestName}
            />
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--wcs-cream-dark)', marginTop: 48, paddingTop: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', marginBottom: 10 }}>
            Woodinville Cookery Society ·{' '}
            <a href="https://woodinvillecookery.com" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
              woodinvillecookery.com
            </a>
          </p>
          <Link to="/ideas" style={{ fontSize: 12, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', textDecoration: 'none', lineHeight: 1.6 }}>
            Have an idea for a future gathering?
          </Link>
        </div>

      </div>

      {/* Host edit overlay */}
      {editMode && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(44,74,46,0.35)' }} onClick={() => setEditMode(false)} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', background: 'var(--wcs-white)', borderRadius: '16px 16px 0 0', padding: '32px 28px 48px', boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}>

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
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={editLabelStyle}>
                    Event type
                    <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--wcs-green-muted)', marginLeft: 8 }}>optional — e.g. Harvest Dinner, Open Fire</span>
                  </label>
                  <input type="text" value={editForm.event_type || ''} onChange={e => setEditForm(p => ({ ...p, event_type: e.target.value }))} placeholder="Leave blank to hide" style={editInputStyle} />
                </div>
                <div>
                  <label style={editLabelStyle}>RSVP deadline</label>
                  <input type="date" value={editForm.rsvp_deadline} onChange={e => setEditForm(p => ({ ...p, rsvp_deadline: e.target.value }))} style={editInputStyle} />
                </div>
                <div>
                  <label style={editLabelStyle}>Guest list reveal date</label>
                  <input type="date" value={editForm.guest_list_reveal_date || ''} onChange={e => setEditForm(p => ({ ...p, guest_list_reveal_date: e.target.value }))} style={editInputStyle} />
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
                  <img src={heroPreview} alt="Event" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 6, display: 'block', marginBottom: 10 }} />
                )}
                <label style={{ display: 'block', cursor: 'pointer' }}>
                  <div style={{ border: '1px dashed var(--wcs-cream-dark)', borderRadius: 6, padding: '12px 16px', background: 'var(--wcs-cream)', textAlign: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui' }}>{heroPreview ? 'Replace image' : 'Upload image'}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--wcs-green-muted)', marginTop: 3, fontFamily: 'Inter, system-ui' }}>1280 × 560 px recommended · JPEG or PNG · max 10 MB</span>
                  </div>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleHeroChange} style={{ display: 'none' }} />
                </label>
                {imageError && <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 5, fontFamily: 'Inter, system-ui' }}>{imageError}</p>}
              </div>

              <div>
                <label style={editLabelStyle}>About this evening</label>
                <textarea rows={4} value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} style={{ ...editInputStyle, resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="all_day" checked={editForm.all_day} onChange={e => setEditForm(p => ({ ...p, all_day: e.target.checked }))} style={{ accentColor: 'var(--wcs-green-dark)', flexShrink: 0 }} />
                <label htmlFor="all_day" style={{ ...editLabelStyle, margin: 0, cursor: 'pointer' }}>All day</label>
              </div>

              <div style={{ border: '1px solid var(--wcs-cream-dark)', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={editLabelStyle}>Date</label>
                  <input type="date" value={editForm.date} onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} style={editInputStyle} />
                </div>
                {!editForm.all_day && (
                  <>
                    <div>
                      <label style={editLabelStyle}>Start time</label>
                      <input type="datetime-local" value={editForm.start_time} onChange={e => setEditForm(p => ({ ...p, start_time: e.target.value }))} style={editInputStyle} />
                    </div>
                    <div>
                      <label style={editLabelStyle}>
                        End time
                        <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--wcs-green-muted)', marginLeft: 8 }}>leave blank for open-ended events</span>
                      </label>
                      <input type="datetime-local" value={editForm.end_time} onChange={e => setEditForm(p => ({ ...p, end_time: e.target.value }))} style={editInputStyle} />
                    </div>
                    <div>
                      <label style={editLabelStyle}>Closing line</label>
                      <input type="text" value={editForm.end_line} onChange={e => setEditForm(p => ({ ...p, end_line: e.target.value }))} placeholder="until the last bottle is empty" style={editInputStyle} />
                    </div>
                  </>
                )}
                <div>
                  <label style={editLabelStyle}>Multi-day end date</label>
                  <input type="date" value={editForm.multi_day_end} onChange={e => setEditForm(p => ({ ...p, multi_day_end: e.target.value }))} style={editInputStyle} />
                </div>
              </div>

              <div>
                <label style={editLabelStyle}>Details</label>
                <textarea rows={4} value={editForm.details} onChange={e => setEditForm(p => ({ ...p, details: e.target.value }))} placeholder="Menu, activities — anything guests should know" style={{ ...editInputStyle, resize: 'vertical' }} />
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

            {/* ─── Gallery controls ─── */}
            <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid var(--wcs-cream-dark)' }}>
              <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 12 }}>
                Photo galleries
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { phase: 'pre', label: 'Pre-event', isOpen: event.pre_gallery_open },
                  { phase: 'post', label: 'Post-event', isOpen: event.post_gallery_open },
                ].map(({ phase, label, isOpen }) => (
                  <div key={phase} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--wcs-cream)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 8 }}>
                    <div>
                      <span style={{ fontSize: 13, fontFamily: 'Inter, system-ui', color: 'var(--wcs-green-dark)', fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: 11, fontFamily: 'Inter, system-ui', color: isOpen ? 'var(--wcs-green-dark)' : 'var(--wcs-green-muted)', marginLeft: 10 }}>
                        {isOpen ? 'Open' : 'Not yet opened'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {isOpen ? (
                        <Link to={`/gallery/${eventId}/${phase}`} style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', textDecoration: 'none' }}>
                          View →
                        </Link>
                      ) : (
                        <button
                          onClick={() => handleOpenGallery(phase)}
                          disabled={galleryOpening === phase}
                          style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--wcs-green-dark)', background: 'none', border: '1px solid var(--wcs-cream-dark)', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontFamily: 'Inter, system-ui' }}
                        >
                          {galleryOpening === phase ? 'Opening…' : 'Open gallery'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {galleryOpenError && <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 8, fontFamily: 'Inter, system-ui' }}>{galleryOpenError}</p>}
            </div>

            {/* ─── For the Table — host items ─── */}
            <div style={{ marginTop: 28, paddingTop: 28, borderTop: '1px solid var(--wcs-cream-dark)' }}>
              <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 12 }}>
                For the Table — provided by hosts
              </p>
              {hostContributions.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {hostContributions.map((c, i) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < hostContributions.length - 1 ? '0.5px solid var(--wcs-cream-dark)' : 'none' }}>
                      <span style={{ fontSize: 13, fontFamily: 'Inter, system-ui', color: 'var(--wcs-green-dark)' }}>{c.item}</span>
                      <button
                        onClick={async () => {
                          await fetch('/api/delete-table-contribution', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ contributionId: c.id, authorId: hostUserId, eventId }),
                          })
                          setHostContributions(prev => prev.filter(x => x.id !== c.id))
                          setForTheTableKey(k => k + 1)
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--wcs-green-muted)', lineHeight: 0, flexShrink: 0, marginLeft: 12 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M1.75 3.5h10.5M5.25 3.5V2.333A.583.583 0 0 1 5.833 1.75h2.334A.583.583 0 0 1 8.75 2.333V3.5m-5.833 0 .583 8.167a.583.583 0 0 0 .583.583h5.834a.583.583 0 0 0 .583-.583L11.083 3.5H2.917Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form
                onSubmit={async e => {
                  e.preventDefault()
                  if (!newHostItem.trim()) return
                  setAddingHostItem(true)
                  setHostItemError('')
                  try {
                    const res = await fetch('/api/add-table-contribution', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ eventId, item: newHostItem.trim(), authorId: hostUserId, isHostProvided: true }),
                    })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.error || 'Could not add item')
                    setHostContributions(prev => [...prev, data.contribution])
                    setNewHostItem('')
                    setForTheTableKey(k => k + 1)
                  } catch (err) {
                    setHostItemError(err.message)
                  } finally {
                    setAddingHostItem(false)
                  }
                }}
                style={{ display: 'flex', gap: 8 }}
              >
                <input
                  type="text"
                  value={newHostItem}
                  onChange={e => { setNewHostItem(e.target.value); setHostItemError('') }}
                  placeholder="Whole roasted pig, Bar setup..."
                  style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 14, color: 'var(--wcs-green-dark)', outline: 'none' }}
                />
                <button
                  type="submit"
                  disabled={!newHostItem.trim() || addingHostItem}
                  style={{ padding: '9px 16px', background: newHostItem.trim() && !addingHostItem ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)', color: 'var(--wcs-cream)', border: 'none', borderRadius: 6, fontFamily: 'Inter, system-ui', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: newHostItem.trim() && !addingHostItem ? 'pointer' : 'not-allowed', flexShrink: 0 }}
                >
                  {addingHostItem ? '…' : 'Add'}
                </button>
              </form>
              {hostItemError && <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 6, fontFamily: 'Inter, system-ui' }}>{hostItemError}</p>}
            </div>

            {/* ─── Add guests ─── */}
            <div style={{ marginTop: 28, paddingTop: 28, borderTop: '1px solid var(--wcs-cream-dark)' }}>
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
                {addGuestError && <p style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8, fontFamily: 'Inter, system-ui' }}>{addGuestError}</p>}
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

            {/* ─── Send update ─── */}
            <div style={{ marginTop: 28, paddingTop: 28, borderTop: '1px solid var(--wcs-cream-dark)' }}>
              <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 12 }}>
                Send update to guests
              </p>
              {blastResult ? (
                <p style={{ fontSize: 13, color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui' }}>
                  {blastResult.sent} {blastResult.sent === 1 ? 'email' : 'emails'} sent.
                  {blastResult.failed > 0 && ` ${blastResult.failed} failed.`}{' '}
                  <button onClick={() => setBlastResult(null)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', textDecoration: 'underline' }}>Send another</button>
                </p>
              ) : blastConfirm ? (
                <div style={{ background: 'var(--wcs-cream)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 8, padding: '16px 20px' }}>
                  <p style={{ fontSize: 13, color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui', marginBottom: 4 }}>
                    <strong>"{blastSubject}"</strong>
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', marginBottom: 16 }}>
                    This will reach {hostGuests.filter(g => (g.rsvp_status === 'attending' || g.rsvp_status === 'maybe') && g.contacts?.email).length} guests who responded yes or maybe.
                  </p>
                  {blastError && <p style={{ fontSize: 12, color: '#b91c1c', marginBottom: 10, fontFamily: 'Inter, system-ui' }}>{blastError}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleBlast} disabled={blastSending} style={{ padding: '10px 20px', background: blastSending ? 'var(--wcs-cream-dark)' : 'var(--wcs-green-dark)', color: 'var(--wcs-cream)', border: 'none', borderRadius: 6, fontFamily: 'Inter, system-ui', fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: blastSending ? 'not-allowed' : 'pointer' }}>
                      {blastSending ? 'Sending…' : 'Confirm & send'}
                    </button>
                    <button onClick={() => { setBlastConfirm(false); setBlastError('') }} style={{ padding: '10px 20px', background: 'transparent', color: 'var(--wcs-green-dark)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, fontFamily: 'Inter, system-ui', fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={e => { e.preventDefault(); setBlastConfirm(true) }}>
                  <input
                    type="text"
                    value={blastSubject}
                    onChange={e => setBlastSubject(e.target.value)}
                    placeholder="Subject line"
                    required
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 14, color: 'var(--wcs-green-dark)', boxSizing: 'border-box', marginBottom: 8 }}
                  />
                  <textarea
                    value={blastNote}
                    onChange={e => setBlastNote(e.target.value)}
                    placeholder="Let your guests know what's changed, what to expect, or simply that you're looking forward to seeing them."
                    rows={4}
                    required
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 14, color: 'var(--wcs-green-dark)', boxSizing: 'border-box', resize: 'vertical', marginBottom: 8 }}
                  />
                  <button
                    type="submit"
                    disabled={!blastSubject.trim() || !blastNote.trim()}
                    style={{ padding: '10px 24px', background: blastSubject.trim() && blastNote.trim() ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)', color: 'var(--wcs-cream)', border: 'none', borderRadius: 6, fontFamily: 'Inter, system-ui', fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: blastSubject.trim() && blastNote.trim() ? 'pointer' : 'not-allowed' }}
                  >
                    Review & send
                  </button>
                </form>
              )}
            </div>

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

function GalleryCard({ label, open, href }) {
  const content = (
    <div style={{ background: 'var(--wcs-white)', border: '1px solid var(--wcs-cream-dark)', borderRadius: 8, padding: '18px 16px', textAlign: 'center', height: '100%', boxSizing: 'border-box' }}>
      <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', textTransform: 'uppercase', color: open ? 'var(--wcs-copper)' : 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', margin: '0 0 6px' }}>
        {label}
      </p>
      <p style={{ fontSize: 12, color: open ? 'var(--wcs-green-dark)' : 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', margin: 0, fontStyle: open ? 'normal' : 'italic' }}>
        {open ? 'View photographs →' : 'Not yet open'}
      </p>
    </div>
  )
  return open
    ? <Link to={href} style={{ textDecoration: 'none', display: 'block' }}>{content}</Link>
    : <div>{content}</div>
}

function HostRsvpSummary({ guests }) {
  const ACTIVE = ['attending', 'maybe', 'declined']
  const counts = guests.reduce((acc, g) => {
    const s = ACTIVE.includes(g.rsvp_status) ? g.rsvp_status : 'no_response'
    const heads = (s === 'attending' || s === 'maybe') ? (g.guest_count || 1) : 1
    acc[s] = (acc[s] || 0) + heads
    return acc
  }, {})
  const items = [
    { key: 'attending',   label: 'Attending',         color: 'var(--wcs-green-dark)' },
    { key: 'maybe',       label: 'I Hope to Make It', color: 'var(--wcs-copper)' },
    { key: 'declined',    label: 'Send My Regrets',   color: '#999' },
    { key: 'no_response', label: 'Awaiting Word',     color: '#bbb' },
  ].filter(i => counts[i.key])
  if (!guests.length) return (
    <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>No guests invited yet.</p>
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

function RsvpForm({ selectedStatus, setSelectedStatus, dietaryNotes, setDietaryNotes, guestCount, setGuestCount, onSubmit, submitting, error }) {
  return (
    <div>
      <h2 className="text-center font-serif" style={{ fontSize: 22, color: 'var(--wcs-green-dark)', marginBottom: 24 }}>
        Will you be joining us?
      </h2>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {RSVP_OPTIONS.map(({ value, label }) => (
            <button key={value} type="button" onClick={() => setSelectedStatus(value)}
              style={{ flex: 1, minWidth: 100, padding: '12px 16px', borderRadius: 6, border: `1px solid ${selectedStatus === value ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)'}`, background: selectedStatus === value ? 'var(--wcs-green-dark)' : 'transparent', color: selectedStatus === value ? 'var(--wcs-cream)' : 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s' }}
            >
              {label}
            </button>
          ))}
        </div>
        {(selectedStatus === 'attending' || selectedStatus === 'maybe') && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 10 }}>
              How many will be joining you?
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button type="button" onClick={() => setGuestCount(c => Math.max(1, c - 1))} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--wcs-cream-dark)', background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 18, color: 'var(--wcs-green-dark)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>−</button>
              <span style={{ fontSize: 20, fontWeight: 300, color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui', minWidth: 24, textAlign: 'center' }}>{guestCount}</span>
              <button type="button" onClick={() => setGuestCount(c => c + 1)} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--wcs-cream-dark)', background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 18, color: 'var(--wcs-green-dark)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
              <span style={{ fontSize: 12, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>{guestCount === 1 ? 'guest (including yourself)' : 'guests (including yourself)'}</span>
            </div>
          </div>
        )}
        {selectedStatus && selectedStatus !== 'declined' && (
          <textarea value={dietaryNotes} onChange={e => setDietaryNotes(e.target.value)} placeholder="Any dietary notes for the host?" rows={3}
            style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, color: 'var(--wcs-green-dark)', resize: 'vertical', marginBottom: 16, boxSizing: 'border-box' }}
          />
        )}
        {error && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={!selectedStatus || submitting}
          style={{ display: 'block', width: '100%', maxWidth: 280, margin: '0 auto', padding: '14px 40px', background: selectedStatus && !submitting ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)', color: 'var(--wcs-cream)', border: 'none', borderRadius: 6, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: selectedStatus && !submitting ? 'pointer' : 'not-allowed' }}
        >
          {submitting ? 'Sending…' : "Yes, I'll be there"}
        </button>
      </form>
    </div>
  )
}

function ConfirmationBlock({ rsvpStatus, onUpdate, icsUrl, hasEmail = true }) {
  const copy = CONFIRMATION[rsvpStatus] || CONFIRMATION.attending
  return (
    <div className="text-center">
      <CopperRule />
      <p className="font-serif" style={{ fontSize: 20, color: 'var(--wcs-green-dark)', marginBottom: 8 }}>{copy.heading()}</p>
      {hasEmail && <p style={{ fontSize: 13, color: 'var(--wcs-green-light)', marginBottom: 16 }}>{copy.sub}</p>}
      {icsUrl && (
        <a href={icsUrl} style={{ display: 'block', fontSize: 12, color: 'var(--wcs-copper)', marginBottom: 16, letterSpacing: '0.04em', fontFamily: 'Inter, system-ui', textDecoration: 'none' }}>
          Add this evening to your calendar
        </a>
      )}
      <button onClick={onUpdate} style={{ fontSize: 11, color: 'var(--wcs-green-muted)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.05em', textDecoration: 'underline' }}>
        Update my RSVP
      </button>
    </div>
  )
}

const WALK_IN_SUBMIT_LABELS = {
  attending: "Count me in",
  maybe:     "I'll try my best",
  declined:  "Send my regrets",
}

function WalkInRsvpForm({ selectedStatus, setSelectedStatus, dietaryNotes, setDietaryNotes, guestCount, setGuestCount, walkInName, setWalkInName, walkInEmail, setWalkInEmail, walkInOptIn, setWalkInOptIn, onSubmit, submitting, error }) {
  const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 14, color: 'var(--wcs-green-dark)', boxSizing: 'border-box', outline: 'none' }
  const canSubmit = selectedStatus && walkInName.trim() && !submitting
  const submitLabel = submitting ? 'Sending…' : (WALK_IN_SUBMIT_LABELS[selectedStatus] || 'Count me in')

  return (
    <div>
      <p className="text-center" style={{ fontSize: 14, color: 'var(--wcs-green-light)', lineHeight: 1.8, marginBottom: 28, fontFamily: 'Inter, system-ui' }}>
        Full details, cooking sign-ups, and the formal invitation follow — stay tuned.
      </p>
      <h2 className="text-center font-serif" style={{ fontSize: 22, color: 'var(--wcs-green-dark)', marginBottom: 24 }}>
        Will you be joining us?
      </h2>
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 8 }}>
          <input type="text" required placeholder="Your name" value={walkInName} onChange={e => setWalkInName(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <input type="email" placeholder="Email address" value={walkInEmail} onChange={e => setWalkInEmail(e.target.value)} style={inputStyle} />
          <p style={{ fontSize: 11, color: 'var(--wcs-green-muted)', marginTop: 6, fontFamily: 'Inter, system-ui', lineHeight: 1.5 }}>
            Optional — for your RSVP confirmation and calendar invite.
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20, cursor: 'pointer' }}>
          <input type="checkbox" checked={walkInOptIn} onChange={e => setWalkInOptIn(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--wcs-green-dark)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--wcs-green-mid)', fontFamily: 'Inter, system-ui', lineHeight: 1.6 }}>Keep me updated about future WCS events</span>
        </label>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {RSVP_OPTIONS.map(({ value, label }) => (
            <button key={value} type="button" onClick={() => setSelectedStatus(value)}
              style={{ flex: 1, minWidth: 100, padding: '12px 16px', borderRadius: 6, border: `1px solid ${selectedStatus === value ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)'}`, background: selectedStatus === value ? 'var(--wcs-green-dark)' : 'transparent', color: selectedStatus === value ? 'var(--wcs-cream)' : 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s' }}
            >
              {label}
            </button>
          ))}
        </div>
        {(selectedStatus === 'attending' || selectedStatus === 'maybe') && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', marginBottom: 10 }}>How many will be joining you?</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button type="button" onClick={() => setGuestCount(c => Math.max(1, c - 1))} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--wcs-cream-dark)', background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 18, color: 'var(--wcs-green-dark)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>−</button>
              <span style={{ fontSize: 20, fontWeight: 300, color: 'var(--wcs-green-dark)', fontFamily: 'Inter, system-ui', minWidth: 24, textAlign: 'center' }}>{guestCount}</span>
              <button type="button" onClick={() => setGuestCount(c => c + 1)} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--wcs-cream-dark)', background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui', fontSize: 18, color: 'var(--wcs-green-dark)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
              <span style={{ fontSize: 12, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>{guestCount === 1 ? 'guest (including yourself)' : 'guests (including yourself)'}</span>
            </div>
          </div>
        )}
        {selectedStatus && selectedStatus !== 'declined' && (
          <textarea value={dietaryNotes} onChange={e => setDietaryNotes(e.target.value)} placeholder="Any dietary notes for the host?" rows={3}
            style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-white)', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, color: 'var(--wcs-green-dark)', resize: 'vertical', marginBottom: 16, boxSizing: 'border-box' }}
          />
        )}
        {error && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button type="submit" disabled={!canSubmit}
          style={{ display: 'block', width: '100%', maxWidth: 280, margin: '0 auto', padding: '14px 40px', background: canSubmit ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)', color: 'var(--wcs-cream)', border: 'none', borderRadius: 6, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: canSubmit ? 'pointer' : 'not-allowed' }}
        >
          {submitLabel}
        </button>
      </form>
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
      {claimError && <p className="text-center" style={{ fontSize: 13, color: '#b91c1c', marginBottom: 12 }}>{claimError}</p>}
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
                    <button onClick={() => handleClaim(item.id)} disabled={claiming === item.id}
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

import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['Wines', 'Dishes', 'Desserts', 'Non-alcoholic', 'Other']

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : null
}

function formatEventDateLabel(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).toUpperCase()
}

const STATUS_TEXT = {
  attending:   { color: 'var(--wcs-green-dark)', label: 'Attending' },
  maybe:       { color: 'var(--wcs-copper)',      label: 'I hope to make it' },
  declined:    { color: 'var(--wcs-green-muted)', label: 'Send my regrets' },
  no_response: { color: 'var(--wcs-green-muted)', label: 'Awaiting word' },
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [events, setEvents]               = useState([])
  const [guestsByEvent, setGuestsByEvent] = useState({})
  const [expandedEvent, setExpandedEvent]   = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [bringItems, setBringItems]         = useState([])
  const [bringClaims, setBringClaims]       = useState([])
  const [addingItem, setAddingItem]         = useState(false)
  const [newItem, setNewItem]               = useState({ category: 'Wines', label: '', slots_total: 1 })
  const [savingItem, setSavingItem]         = useState(false)
  const [editingDetails, setEditingDetails] = useState(false)
  const [detailsForm, setDetailsForm]       = useState({})
  const [savingDetails, setSavingDetails]   = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase.from('profiles').upsert(
        { id: user.id, email: user.email, name: user.user_metadata?.full_name || user.email.split('@')[0], role: 'host' },
        { onConflict: 'id' }
      )

      const { data: eventsData } = await supabase
        .from('events')
        .select('id, name, date, save_the_date_sent_at, theme, dress_code, what_to_expect, rsvp_deadline, location')
        .eq('host_id', user.id)
        .order('date', { ascending: true })

      if (eventsData?.length) {
        setEvents(eventsData)
        setExpandedEvent(eventsData[0].id)
        setSelectedEventId(eventsData[0].id)

        const eventIds = eventsData.map(e => e.id)

        const { data: guestsData } = await supabase
          .from('guests')
          .select('id, rsvp_status, rsvp_at, dietary_notes, event_id, contacts(name, email)')
          .in('event_id', eventIds)

        if (guestsData) {
          const byEvent = {}
          for (const g of guestsData) {
            if (!byEvent[g.event_id]) byEvent[g.event_id] = []
            byEvent[g.event_id].push(g)
          }
          setGuestsByEvent(byEvent)
        }

        await loadBringList(eventsData[0].id)
      }
    }
    init()
  }, [])

  async function loadBringList(eventId) {
    const { data: items } = await supabase
      .from('bring_list_items')
      .select('id, category, label, slots_total')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })

    if (items?.length) {
      setBringItems(items)
      const { data: claims } = await supabase
        .from('bring_list_claims')
        .select('id, item_id, guests(contacts(name))')
        .in('item_id', items.map(i => i.id))
      setBringClaims(claims || [])
    } else {
      setBringItems([])
      setBringClaims([])
    }
  }

  async function handleAddItem(e) {
    e.preventDefault()
    if (!newItem.label.trim() || !activeEvent) return
    setSavingItem(true)
    const { error } = await supabase
      .from('bring_list_items')
      .insert({ event_id: activeEvent.id, category: newItem.category, label: newItem.label.trim(), slots_total: newItem.slots_total })
    if (!error) {
      await loadBringList(activeEvent.id)
      setNewItem({ category: 'Wines', label: '', slots_total: 1 })
      setAddingItem(false)
    }
    setSavingItem(false)
  }

  async function handleDeleteItem(itemId) {
    await supabase.from('bring_list_items').delete().eq('id', itemId)
    if (activeEvent) await loadBringList(activeEvent.id)
  }

  async function selectEvent(eventId) {
    setSelectedEventId(eventId)
    setExpandedEvent(eventId)
    setEditingDetails(false)
    setAddingItem(false)
    await loadBringList(eventId)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  function openEditDetails(event) {
    setDetailsForm({
      theme:          event.theme || '',
      dress_code:     event.dress_code || '',
      what_to_expect: event.what_to_expect || '',
      rsvp_deadline:  event.rsvp_deadline || '',
      location:       event.location || '',
    })
    setEditingDetails(true)
  }

  async function handleSaveDetails(e) {
    e.preventDefault()
    if (!activeEvent) return
    setSavingDetails(true)
    const { data: updated } = await supabase
      .from('events')
      .update({
        theme:          detailsForm.theme || null,
        dress_code:     detailsForm.dress_code || null,
        what_to_expect: detailsForm.what_to_expect || null,
        rsvp_deadline:  detailsForm.rsvp_deadline || null,
        location:       detailsForm.location || null,
      })
      .eq('id', activeEvent.id)
      .select('id, name, date, save_the_date_sent_at, theme, dress_code, what_to_expect, rsvp_deadline, location')
      .single()

    if (updated) {
      setEvents(prev => prev.map(ev => ev.id === updated.id ? updated : ev))
    }
    setSavingDetails(false)
    setEditingDetails(false)
  }

  function counts(guests = []) {
    return {
      attending:   guests.filter(g => g.rsvp_status === 'attending').length,
      maybe:       guests.filter(g => g.rsvp_status === 'maybe').length,
      declined:    guests.filter(g => g.rsvp_status === 'declined').length,
      no_response: guests.filter(g => !g.rsvp_status || g.rsvp_status === 'no_response').length,
    }
  }

  const activeEvent  = events.find(e => e.id === selectedEventId) || events[0] || null
  const activeGuests = activeEvent ? (guestsByEvent[activeEvent.id] || []) : []
  const activeCounts = counts(activeGuests)

  // Group bring-list items by category
  const itemsByCategory = bringItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  function claimsForItem(itemId) {
    return bringClaims.filter(c => c.item_id === itemId)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--wcs-cream)' }}>

      {/* Header */}
      <header style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/dashboard" style={{ display: 'inline-block', lineHeight: 0 }}>
          <img src="/wcs_logo.png" alt="Woodinville Cookery Society" style={{ width: 120, height: 'auto' }} />
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Link to="/history" style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', textDecoration: 'none' }}>History</Link>
          {['Contacts', 'Preferences'].map((label) => (
            <span key={label} style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', cursor: 'default' }}>{label}</span>
          ))}
          <button onClick={handleLogout} style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Leave
          </button>
        </nav>
      </header>

      <div style={{ borderTop: '1px solid var(--wcs-cream-dark)' }} />

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>

        {!activeEvent ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <h2 className="font-serif" style={{ fontSize: 24, marginBottom: 8 }}>Your table awaits.</h2>
            <p style={{ fontSize: 14, color: 'var(--wcs-green-light)', marginBottom: 24 }}>Begin by marking the date for your first gathering.</p>
            <Link to="/dashboard/save-the-date" style={primaryBtnStyle}>Send the notice</Link>
          </div>
        ) : (
          <>
            {/* Event summary */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <h2 className="font-serif" style={{ fontSize: 24, marginBottom: 6 }}>{activeEvent.name}</h2>
                <Link
                  to={`/event/${activeEvent.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', textDecoration: 'none', flexShrink: 0 }}
                >
                  See the details →
                </Link>
              </div>
              <p style={labelStyle}>
                {formatEventDateLabel(activeEvent.date)}
                {daysUntil(activeEvent.date) !== null && ` · ${daysUntil(activeEvent.date)} DAYS AWAY`}
              </p>
              <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '16px 0' }} />
            </div>

            {/* Event details card */}
            <div style={{ ...cardStyle, marginBottom: 32 }}>
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--wcs-cream-dark)' }}>
                <span style={{ fontFamily: 'Inter, system-ui', fontSize: 13, fontWeight: 500 }}>About the evening</span>
                {!editingDetails && (
                  <button onClick={() => openEditDetails(activeEvent)} style={{ fontSize: 12, color: 'var(--wcs-copper)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, system-ui' }}>
                    Edit
                  </button>
                )}
              </div>

              {editingDetails ? (
                <form onSubmit={handleSaveDetails} style={{ padding: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <label style={{ ...labelStyle, display: 'block', marginBottom: 4 }}>Theme / Vibe</label>
                      <input type="text" value={detailsForm.theme} onChange={e => setDetailsForm(p => ({ ...p, theme: e.target.value }))} placeholder="A midsummer garden dinner" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, display: 'block', marginBottom: 4 }}>Dress Code</label>
                      <input type="text" value={detailsForm.dress_code} onChange={e => setDetailsForm(p => ({ ...p, dress_code: e.target.value }))} placeholder="Garden party attire" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, display: 'block', marginBottom: 4 }}>Location / Address</label>
                      <input type="text" value={detailsForm.location} onChange={e => setDetailsForm(p => ({ ...p, location: e.target.value }))} placeholder="123 Vine St, Woodinville WA" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, display: 'block', marginBottom: 4 }}>RSVP Deadline</label>
                      <input type="date" value={detailsForm.rsvp_deadline} onChange={e => setDetailsForm(p => ({ ...p, rsvp_deadline: e.target.value }))} style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ ...labelStyle, display: 'block', marginBottom: 4 }}>
                      What to Expect
                      <span style={{ color: 'var(--wcs-green-muted)', marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>{detailsForm.what_to_expect.length}/280</span>
                    </label>
                    <textarea
                      value={detailsForm.what_to_expect}
                      onChange={e => setDetailsForm(p => ({ ...p, what_to_expect: e.target.value.slice(0, 280) }))}
                      placeholder="A warm evening with friends, great wine, and a feast from the garden…"
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="submit" disabled={savingDetails} style={{ ...primaryBtnStyle, padding: '10px 24px' }}>
                      {savingDetails ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditingDetails(false)} style={{ ...secondaryBtnStyle, padding: '10px 24px' }}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 32px' }}>
                  {[
                    ['Theme', activeEvent.theme],
                    ['Dress Code', activeEvent.dress_code],
                    ['Location', activeEvent.location],
                    ['RSVP Deadline', activeEvent.rsvp_deadline ? new Date(activeEvent.rsvp_deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p style={{ ...labelStyle, marginBottom: 2 }}>{label}</p>
                      <p style={{ fontSize: 13, fontFamily: 'Inter, system-ui', color: value ? 'var(--wcs-green-dark)' : 'var(--wcs-green-muted)', margin: 0 }}>
                        {value || '—'}
                      </p>
                    </div>
                  ))}
                  {(activeEvent.what_to_expect) && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <p style={{ ...labelStyle, marginBottom: 2 }}>What to Expect</p>
                      <p style={{ fontSize: 13, fontFamily: 'Inter, system-ui', color: 'var(--wcs-green-dark)', margin: 0, lineHeight: 1.6 }}>
                        {activeEvent.what_to_expect}
                      </p>
                    </div>
                  )}
                  {!activeEvent.theme && !activeEvent.dress_code && !activeEvent.location && !activeEvent.what_to_expect && !activeEvent.rsvp_deadline && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <p style={{ fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', margin: 0 }}>Nothing here yet. Click Edit to describe the evening — theme, dress, location, and what to expect.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RSVP metric cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 32 }}>
              {[['attending','Attending'],['maybe','I hope to make it'],['declined','Send my regrets'],['no_response','Awaiting word']].map(([key, label]) => (
                <div key={key} style={{ background: 'var(--wcs-cream-mid)', borderRadius: 6, padding: 14, textAlign: 'center' }}>
                  <div className="font-serif" style={{ fontSize: 28, lineHeight: 1 }}>{activeCounts[key]}</div>
                  <div style={labelStyle}>{label}</div>
                </div>
              ))}
            </div>

            {/* Bring-list card */}
            <div style={cardStyle}>
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--wcs-cream-dark)' }}>
                <span style={{ fontFamily: 'Inter, system-ui', fontSize: 13, fontWeight: 500 }}>What we're bringing</span>
                <button
                  onClick={() => setAddingItem(v => !v)}
                  style={{ fontSize: 12, color: 'var(--wcs-copper)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, system-ui' }}
                >
                  {addingItem ? 'Cancel' : 'Add to the table'}
                </button>
              </div>

              {/* Add item form */}
              {addingItem && (
                <form onSubmit={handleAddItem} style={{ padding: '16px 20px', borderBottom: '1px solid var(--wcs-cream-dark)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 140px' }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Category</label>
                    <select value={newItem.category} onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))} style={inputStyle}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 180px' }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Item</label>
                    <input type="text" required placeholder="e.g. Pinot Noir" value={newItem.label} onChange={e => setNewItem(p => ({ ...p, label: e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 80px' }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Slots</label>
                    <input type="number" min={1} max={20} value={newItem.slots_total} onChange={e => setNewItem(p => ({ ...p, slots_total: parseInt(e.target.value) || 1 }))} style={inputStyle} />
                  </div>
                  <button type="submit" disabled={savingItem} style={{ ...primaryBtnStyle, padding: '10px 20px', flex: '0 0 auto' }}>
                    {savingItem ? 'Adding…' : 'Add'}
                  </button>
                </form>
              )}

              {/* Items grouped by category */}
              {bringItems.length === 0 && !addingItem ? (
                <div style={{ padding: '24px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>The table is yours to set.</p>
                </div>
              ) : (
                Object.entries(itemsByCategory).map(([category, items]) => (
                  <div key={category}>
                    <div style={{ padding: '10px 20px', background: 'var(--wcs-cream-mid)' }}>
                      <span style={labelStyle}>{category.toUpperCase()}</span>
                    </div>
                    {items.map((item, i) => {
                      const claimed = claimsForItem(item.id).length
                      const full = claimed >= item.slots_total
                      return (
                        <div key={item.id} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '0.5px solid var(--wcs-cream-dark)', background: i % 2 === 0 ? 'var(--wcs-white)' : 'var(--wcs-cream-mid)' }}>
                          <span style={{ fontSize: 13, fontFamily: 'Inter, system-ui' }}>{item.label}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <span style={{ fontSize: 12, fontFamily: 'Inter, system-ui', color: full ? 'var(--wcs-green-muted)' : 'var(--wcs-copper)', fontWeight: 500 }}>
                              {claimed} of {item.slots_total} claimed
                            </span>
                            <button onClick={() => handleDeleteItem(item.id)} style={{ fontSize: 11, color: 'var(--wcs-green-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, system-ui' }}>
                              ×
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
              <Link to="/dashboard/save-the-date" style={primaryBtnStyle}>New Event</Link>
              <button style={secondaryBtnStyle}>Add your guests</button>
            </div>

            {/* Guest list */}
            {events.map(event => {
              const guests = guestsByEvent[event.id] || []
              const isExpanded = expandedEvent === event.id
              const isActive = selectedEventId === event.id
              return (
                <div key={event.id} style={{ ...cardStyle, marginBottom: 16, ...(isActive ? { borderLeftColor: 'var(--wcs-copper)', borderLeftWidth: 3 } : {}) }}>
                  <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button onClick={() => selectEvent(event.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                      <div>
                        <p className="font-serif" style={{ fontSize: 15, margin: 0 }}>{event.name}</p>
                        <p style={{ fontSize: 11, color: 'var(--wcs-green-muted)', margin: '3px 0 0', fontFamily: 'Inter, system-ui' }}>{guests.length} guest{guests.length !== 1 ? 's' : ''}</p>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--wcs-green-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    <Link
                      to={`/event/${event.id}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 11, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', textDecoration: 'none', flexShrink: 0 }}
                    >
                      See the details
                    </Link>
                  </div>

                  {isExpanded && guests.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderTop: '1px solid var(--wcs-cream-dark)' }}>
                          {['Name', 'Email', 'RSVP Status'].map((h, i) => (
                            <th key={i} style={{ padding: '10px 20px', textAlign: 'left', ...labelStyle, fontFamily: 'Inter, system-ui', fontWeight: 500 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {guests.map((g, i) => {
                          const key = g.rsvp_status || 'no_response'
                          const { color, label } = STATUS_TEXT[key] || STATUS_TEXT.no_response
                          return (
                            <tr key={g.id} style={{ background: i % 2 === 0 ? 'var(--wcs-white)' : 'var(--wcs-cream-mid)', borderTop: '0.5px solid var(--wcs-cream-dark)' }}>
                              <td style={{ padding: '12px 20px', fontFamily: 'Inter, system-ui' }}>{g.contacts?.name || '—'}</td>
                              <td style={{ padding: '12px 20px', color: 'var(--wcs-green-light)', fontFamily: 'Inter, system-ui' }}>{g.contacts?.email || '—'}</td>
                              <td style={{ padding: '12px 20px', color, fontFamily: 'Inter, system-ui', fontWeight: 500 }}>{label}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}

                  {isExpanded && guests.length === 0 && (
                    <div style={{ borderTop: '1px solid var(--wcs-cream-dark)', padding: '24px 20px', textAlign: 'center' }}>
                      <p style={{ fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>Every good table starts somewhere.</p>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </main>
    </div>
  )
}

// Shared styles
const labelStyle = {
  fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
  textTransform: 'uppercase', color: 'var(--wcs-copper)',
  fontFamily: 'Inter, system-ui',
}

const cardStyle = {
  background: 'var(--wcs-white)', borderRadius: 10,
  border: '1px solid var(--wcs-cream-dark)', overflow: 'hidden', marginBottom: 24,
}

const primaryBtnStyle = {
  display: 'inline-block',
  background: 'var(--wcs-green-dark)', color: 'var(--wcs-cream)',
  padding: '14px 32px', borderRadius: 6, border: 'none',
  fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12,
  fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase',
  cursor: 'pointer', textDecoration: 'none',
}

const secondaryBtnStyle = {
  background: 'transparent', color: 'var(--wcs-green-dark)',
  border: '1px solid var(--wcs-green-dark)', padding: '12px 32px',
  borderRadius: 6, fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 12, fontWeight: 500, letterSpacing: '0.1em',
  textTransform: 'uppercase', cursor: 'pointer',
}

const inputStyle = {
  padding: '8px 12px', border: '1px solid var(--wcs-cream-dark)',
  borderRadius: 6, background: 'var(--wcs-white)',
  fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13,
  color: 'var(--wcs-green-dark)', width: '100%', boxSizing: 'border-box',
}

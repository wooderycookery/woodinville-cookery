import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import { supabase } from '../lib/supabase'

function parseGuests(results) {
  return results.data
    .map(row => {
      const norm = Object.keys(row).reduce((acc, k) => {
        acc[k.toLowerCase().trim()] = String(row[k] || '').trim()
        return acc
      }, {})
      const email = (norm.email || norm['e-mail'] || '').toLowerCase()
      const name = norm.name || norm['full name'] || norm.fullname || norm.full_name || ''
      return { name: name || email.split('@')[0], email }
    })
    .filter(r => r.email.includes('@') && r.email.includes('.'))
}

function parseEmailText(text) {
  return text
    .split(/[\n,;]+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.includes('@') && s.includes('.'))
    .map(email => ({ email, name: email.split('@')[0] }))
}

function mergeGuests(existing, incoming) {
  const seen = new Set(existing.map(g => g.email))
  const added = incoming.filter(g => !seen.has(g.email))
  return [...existing, ...added]
}

const labelStyle = {
  fontSize: 10, fontWeight: 500, letterSpacing: '0.18em',
  textTransform: 'uppercase', color: 'var(--wcs-copper)',
  fontFamily: 'Inter, system-ui',
}

export default function SaveTheDate() {
  const [form, setForm] = useState({
    eventName: '',
    eventDate: '',
    hostNames: '',
    teaserLine: '',
  })
  const [heroImage, setHeroImage]           = useState(null)
  const [parsedGuests, setParsedGuests]     = useState([])
  const [csvError, setCsvError]             = useState('')
  const [emailText, setEmailText]           = useState('')
  const [showContacts, setShowContacts]     = useState(false)
  const [contacts, setContacts]             = useState([])
  const [contactsSearch, setContactsSearch] = useState('')
  const [selectedContacts, setSelectedContacts] = useState(new Set())
  const [contactsLoading, setContactsLoading]   = useState(false)
  const [status, setStatus]                 = useState(null)
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState('')
  const csvInputRef = useRef(null)

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  function handleImageChange(e) {
    const file = e.target.files?.[0]
    if (file && file.size > 10 * 1024 * 1024) {
      setError('Hero image must be under 10MB.')
      return
    }
    setHeroImage(file || null)
  }

  function handleAddEmailText() {
    const incoming = parseEmailText(emailText)
    if (incoming.length === 0) return
    setParsedGuests(prev => mergeGuests(prev, incoming))
    setEmailText('')
  }

  function handleCsvChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError('')
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const guests = parseGuests(results)
        if (guests.length === 0) {
          setCsvError('No valid guests found. Ensure the file has an "email" column.')
          return
        }
        setParsedGuests(prev => mergeGuests(prev, guests))
        if (csvInputRef.current) csvInputRef.current.value = ''
      },
      error: () => {
        setCsvError('Could not read this file. Please check it is a valid CSV.')
        if (csvInputRef.current) csvInputRef.current.value = ''
      },
    })
  }

  function removeGuest(email) {
    setParsedGuests(prev => prev.filter(g => g.email !== email))
  }

  async function openContactsPicker() {
    if (showContacts) { setShowContacts(false); return }
    setShowContacts(true)
    if (contacts.length > 0) return
    setContactsLoading(true)
    const { data } = await supabase.from('contacts').select('id, name, email').order('name')
    setContacts(data || [])
    setContactsLoading(false)
  }

  function toggleContact(id) {
    setSelectedContacts(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function addSelectedContacts() {
    const incoming = contacts
      .filter(c => selectedContacts.has(c.id))
      .map(c => ({ email: c.email, name: c.name || c.email.split('@')[0] }))
    setParsedGuests(prev => mergeGuests(prev, incoming))
    setSelectedContacts(new Set())
    setShowContacts(false)
    setContactsSearch('')
  }

  const filteredContacts = contacts.filter(c => {
    const q = contactsSearch.toLowerCase()
    return !q || c.name?.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
  })

  async function handleSubmit(e) {
    e.preventDefault()
    // Flush any emails sitting in the textarea before submitting
    const pendingFromText = parseEmailText(emailText)
    const allGuests = mergeGuests(parsedGuests, pendingFromText)
    if (allGuests.length === 0) {
      setError('Add at least one guest to continue.')
      return
    }
    if (pendingFromText.length > 0) {
      setParsedGuests(allGuests)
      setEmailText('')
    }
    setLoading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // 1. Upload hero image if provided
      let heroImageUrl = null
      if (heroImage) {
        const ext = heroImage.name.split('.').pop()
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('event-images')
          .upload(path, heroImage)
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage
          .from('event-images')
          .getPublicUrl(path)
        heroImageUrl = publicUrl
      }

      // 2. Create event record
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          name: form.eventName,
          date: new Date(form.eventDate).toISOString(),
          host_id: user.id,
          description: form.teaserLine,
          vibe: JSON.stringify({ heroImageUrl, hostNames: form.hostNames }),
        })
        .select()
        .single()
      if (eventError) throw eventError

      // 3. Upsert contacts and create guest records with tokens
      const guestList = []
      for (const { name, email } of allGuests) {
        const { data: contact, error: contactError } = await supabase
          .from('contacts')
          .upsert({ email, name }, { onConflict: 'email' })
          .select()
          .single()
        if (contactError) throw contactError

        const { data: existing } = await supabase
          .from('guests')
          .select('id, invite_token')
          .eq('contact_id', contact.id)
          .eq('event_id', event.id)
          .maybeSingle()

        if (existing) {
          guestList.push({ email, token: existing.invite_token })
          continue
        }

        const token = crypto.randomUUID()
        const { error: guestError } = await supabase
          .from('guests')
          .insert({ contact_id: contact.id, event_id: event.id, invite_token: token })
        if (guestError) throw guestError

        guestList.push({ email, token })
      }

      // 4. Send personalized emails
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin
      const res = await fetch('/api/send-save-the-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          eventName: form.eventName,
          eventDate: form.eventDate,
          hostNames: form.hostNames,
          teaserLine: form.teaserLine,
          heroImageUrl,
          guests: guestList,
          appUrl,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Email send failed')
      }

      // 5. Mark save_the_date_sent_at
      await supabase
        .from('events')
        .update({ save_the_date_sent_at: new Date().toISOString() })
        .eq('id', event.id)

      setStatus({ sent: guestList.length, eventId: event.id })
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  if (status) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--wcs-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <img src="/WCS_logo.png" alt="Woodinville Cookery Society" style={{ width: 120, height: 'auto', display: 'inline-block', marginBottom: 28 }} />
          <div style={{ width: 40, height: 1, background: 'var(--wcs-copper)', margin: '0 auto 28px' }} />
          <h2 className="font-serif" style={{ fontSize: 24, color: 'var(--wcs-green-dark)', marginBottom: 10 }}>
            The notice has been sent.
          </h2>
          <p style={{ fontSize: 14, color: 'var(--wcs-green-light)', marginBottom: 32, fontFamily: 'Inter, system-ui' }}>
            Your notice has been sent to {status.sent} {status.sent === 1 ? 'guest' : 'guests'}.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Link
              to={`/event/${status.eventId}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', textDecoration: 'none' }}
            >
              See the event page →
            </Link>
            <Link
              to="/dashboard"
              style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui', textDecoration: 'none' }}
            >
              Return to your events
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--wcs-cream)' }}>
      <header style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--wcs-cream-dark)' }}>
        <Link to="/dashboard" style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wcs-green-muted)', textDecoration: 'none', fontFamily: 'Inter, system-ui' }}>
          ← Your events
        </Link>
        <img src="/WCS_logo.png" alt="Woodinville Cookery Society" style={{ width: 120, height: 'auto' }} />
        <div style={{ width: 80 }} />
      </header>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Event Name */}
          <div>
            <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }} htmlFor="eventName">
              Event Name <span style={{ color: 'var(--wcs-copper)' }}>*</span>
            </label>
            <input
              id="eventName" name="eventName" type="text" required
              value={form.eventName} onChange={handleChange}
              placeholder="Woodinville Cookery Society — Summer Gathering"
              style={inputStyle}
            />
          </div>

          {/* Event Date */}
          <div>
            <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }} htmlFor="eventDate">
              Event Date <span style={{ color: 'var(--wcs-copper)' }}>*</span>
            </label>
            <input
              id="eventDate" name="eventDate" type="date" required
              value={form.eventDate} onChange={handleChange}
              style={inputStyle}
            />
          </div>

          {/* Host Names */}
          <div>
            <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }} htmlFor="hostNames">
              Host Name(s) <span style={{ color: 'var(--wcs-copper)' }}>*</span>
            </label>
            <input
              id="hostNames" name="hostNames" type="text" required
              value={form.hostNames} onChange={handleChange}
              placeholder="Rob & Lisa Knox"
              style={inputStyle}
            />
          </div>

          {/* Teaser Line */}
          <div>
            <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }} htmlFor="teaserLine">
              Teaser Line <span style={{ color: 'var(--wcs-copper)' }}>*</span>
              <span style={{ color: 'var(--wcs-green-muted)', marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>{form.teaserLine.length}/120</span>
            </label>
            <input
              id="teaserLine" name="teaserLine" type="text" required maxLength={120}
              value={form.teaserLine} onChange={handleChange}
              placeholder="Something worth clearing your calendar for."
              style={inputStyle}
            />
          </div>

          {/* Hero Image */}
          <div>
            <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }} htmlFor="heroImage">
              Hero Image
              <span style={{ color: 'var(--wcs-green-muted)', marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>optional, max 10MB</span>
            </label>
            <input
              id="heroImage" type="file" accept="image/*"
              onChange={handleImageChange}
              style={{ fontSize: 13, color: 'var(--wcs-green-light)', fontFamily: 'Inter, system-ui', width: '100%' }}
            />
          </div>

          {/* Guest List */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={labelStyle}>
                Your Guests <span style={{ color: 'var(--wcs-copper)' }}>*</span>
              </label>
              {parsedGuests.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>
                  {parsedGuests.length} {parsedGuests.length === 1 ? 'guest' : 'guests'}
                </span>
              )}
            </div>

            {/* Textarea input */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <textarea
                value={emailText}
                onChange={e => setEmailText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEmailText() } }}
                placeholder={'Paste or type email addresses, one per line'}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', flex: 1, lineHeight: 1.6 }}
              />
              <button
                type="button"
                onClick={handleAddEmailText}
                disabled={!emailText.trim()}
                style={{
                  alignSelf: 'flex-end',
                  padding: '10px 16px',
                  background: emailText.trim() ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)',
                  color: 'var(--wcs-cream)',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontFamily: 'Inter, system-ui',
                  cursor: emailText.trim() ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                }}
              >
                Add
              </button>
            </div>

            {/* Secondary actions */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <button
                type="button"
                onClick={openContactsPicker}
                style={ghostButtonStyle}
              >
                + From saved contacts
              </button>
              <button
                type="button"
                onClick={() => csvInputRef.current?.click()}
                style={ghostButtonStyle}
              >
                + Upload CSV
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvChange}
                style={{ display: 'none' }}
              />
            </div>

            {csvError && (
              <p style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8, fontFamily: 'Inter, system-ui' }}>{csvError}</p>
            )}

            {/* Contacts picker */}
            {showContacts && (
              <div style={{ border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, background: 'var(--wcs-white)', marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--wcs-cream-dark)' }}>
                  <input
                    type="text"
                    placeholder="Search contacts…"
                    value={contactsSearch}
                    onChange={e => setContactsSearch(e.target.value)}
                    style={{ ...inputStyle, padding: '7px 10px', fontSize: 13 }}
                    autoFocus
                  />
                </div>
                {contactsLoading ? (
                  <p style={{ padding: '12px 16px', fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>Loading…</p>
                ) : filteredContacts.length === 0 ? (
                  <p style={{ padding: '12px 16px', fontSize: 13, color: 'var(--wcs-green-muted)', fontFamily: 'Inter, system-ui' }}>No contacts found.</p>
                ) : (
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {filteredContacts.map(c => {
                      const alreadyAdded = parsedGuests.some(g => g.email === c.email)
                      return (
                        <label
                          key={c.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '9px 14px',
                            cursor: alreadyAdded ? 'default' : 'pointer',
                            borderBottom: '0.5px solid var(--wcs-cream-dark)',
                            opacity: alreadyAdded ? 0.45 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedContacts.has(c.id)}
                            disabled={alreadyAdded}
                            onChange={() => toggleContact(c.id)}
                            style={{ accentColor: 'var(--wcs-copper)', flexShrink: 0 }}
                          />
                          <span style={{ fontSize: 13, fontFamily: 'Inter, system-ui', color: 'var(--wcs-green-dark)', flex: 1, minWidth: 0 }}>
                            {c.name && <strong style={{ fontWeight: 500 }}>{c.name}</strong>}
                            {c.name && ' '}
                            <span style={{ color: 'var(--wcs-green-muted)' }}>{c.email}</span>
                          </span>
                          {alreadyAdded && <span style={{ fontSize: 10, color: 'var(--wcs-copper)', fontFamily: 'Inter, system-ui', letterSpacing: '0.08em' }}>Added</span>}
                        </label>
                      )
                    })}
                  </div>
                )}
                <div style={{ padding: '10px 14px', borderTop: '1px solid var(--wcs-cream-dark)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" onClick={() => { setShowContacts(false); setContactsSearch('') }} style={ghostButtonStyle}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addSelectedContacts}
                    disabled={selectedContacts.size === 0}
                    style={{
                      padding: '8px 16px',
                      background: selectedContacts.size > 0 ? 'var(--wcs-green-dark)' : 'var(--wcs-cream-dark)',
                      color: 'var(--wcs-cream)',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      fontFamily: 'Inter, system-ui',
                      cursor: selectedContacts.size > 0 ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {selectedContacts.size > 0 ? `Add ${selectedContacts.size}` : 'Add'}
                  </button>
                </div>
              </div>
            )}

            {/* Unified guest preview table */}
            {parsedGuests.length > 0 && (
              <div style={{ border: '1px solid var(--wcs-cream-dark)', borderRadius: 6, overflow: 'hidden', background: 'var(--wcs-white)' }}>
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr style={{ borderBottom: '1px solid var(--wcs-cream-dark)', background: 'var(--wcs-cream-mid)' }}>
                        <th style={{ padding: '8px 14px', textAlign: 'left', ...labelStyle, fontWeight: 500 }}>Name</th>
                        <th style={{ padding: '8px 14px', textAlign: 'left', ...labelStyle, fontWeight: 500 }}>Email</th>
                        <th style={{ padding: '8px 10px', width: 32 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {parsedGuests.map((g, i) => (
                        <tr key={g.email} style={{ borderTop: '0.5px solid var(--wcs-cream-dark)', background: i % 2 === 0 ? 'var(--wcs-white)' : 'var(--wcs-cream-mid)' }}>
                          <td style={{ padding: '9px 14px', fontFamily: 'Inter, system-ui', color: 'var(--wcs-green-dark)' }}>{g.name}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'Inter, system-ui', color: 'var(--wcs-green-light)' }}>{g.email}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => removeGuest(g.email)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wcs-green-muted)', fontSize: 14, lineHeight: 1, padding: 0 }}
                              aria-label={`Remove ${g.email}`}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {error && <p style={{ fontSize: 13, color: '#b91c1c', margin: 0 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading || (parsedGuests.length === 0 && parseEmailText(emailText).length === 0)}
            style={{
              width: '100%',
              padding: '14px 40px',
              background: (loading || (parsedGuests.length === 0 && parseEmailText(emailText).length === 0)) ? 'var(--wcs-cream-dark)' : 'var(--wcs-green-dark)',
              color: 'var(--wcs-cream)',
              border: 'none',
              borderRadius: 6,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: (loading || (parsedGuests.length === 0 && parseEmailText(emailText).length === 0)) ? 'not-allowed' : 'pointer',
            }}
          >
            {(() => {
              const total = mergeGuests(parsedGuests, parseEmailText(emailText)).length
              return loading
                ? `Sending to ${total} ${total === 1 ? 'guest' : 'guests'}…`
                : total > 0
                ? `Send the notice — ${total} ${total === 1 ? 'guest' : 'guests'}`
                : 'Send the notice'
            })()}
          </button>

        </form>
      </main>
    </div>
  )
}

const inputStyle = {
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
}

const ghostButtonStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--wcs-copper)',
  fontFamily: 'Inter, system-ui',
  padding: 0,
}

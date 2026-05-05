import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SaveTheDate() {
  const [form, setForm] = useState({
    eventName: '',
    eventDate: '',
    hostNames: '',
    teaserLine: '',
    guestEmails: '',
  })
  const [heroImage, setHeroImage] = useState(null)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  function parseEmails(raw) {
    return raw
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.includes('@'))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const emails = parseEmails(form.guestEmails)
    if (emails.length === 0) {
      setError('Please enter at least one guest email.')
      setLoading(false)
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // 1. Upload hero image if provided
      let heroImageUrl = null
      if (heroImage) {
        const ext = heroImage.name.split('.').pop()
        const path = `temp/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('event-images')
          .upload(path, heroImage, { upsert: true })
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
        })
        .select()
        .single()
      if (eventError) throw eventError

      // Store hero image url on event via update (future: dedicated column)
      if (heroImageUrl) {
        await supabase.from('events').update({ vibe: heroImageUrl }).eq('id', event.id)
      }

      // 3. Upsert contacts and create guest records
      const guestIds = []
      for (const email of emails) {
        const { data: contact, error: contactError } = await supabase
          .from('contacts')
          .upsert({ email, name: email.split('@')[0] }, { onConflict: 'email' })
          .select()
          .single()
        if (contactError) throw contactError

        const { data: guest, error: guestError } = await supabase
          .from('guests')
          .insert({ contact_id: contact.id, event_id: event.id })
          .select()
          .single()
        if (guestError) throw guestError

        guestIds.push(guest.id)
      }

      // 4. Send emails via API route
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
          emails,
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

      setStatus({ sent: emails.length, eventId: event.id })
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  if (status) {
    return (
      <div className="min-h-screen bg-wcs-cream flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 bg-wcs-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-wcs-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-serif text-2xl text-wcs-green mb-2">Save the Date Sent</h2>
          <p className="text-wcs-green/60 text-sm mb-6">
            Delivered to {status.sent} {status.sent === 1 ? 'guest' : 'guests'}.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              to={`/event/${status.eventId}`}
              target="_blank"
              className="text-sm text-wcs-copper underline"
            >
              Preview event landing page →
            </Link>
            <Link to="/dashboard" className="text-sm text-wcs-green/60 hover:text-wcs-green">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-wcs-cream">
      <header className="border-b border-wcs-green/10 bg-white px-6 py-4 flex items-center justify-between">
        <Link to="/dashboard" className="text-sm text-wcs-green/60 hover:text-wcs-green transition-colors">
          ← Dashboard
        </Link>
        <h1 className="font-serif text-xl text-wcs-green">Save the Date</h1>
        <div className="w-20" />
      </header>

      <main className="max-w-xl mx-auto px-6 py-10">
        <form onSubmit={handleSubmit} className="space-y-6">

          <div>
            <label className="block text-sm text-wcs-green mb-1" htmlFor="eventName">
              Event Name <span className="text-wcs-copper">*</span>
            </label>
            <input
              id="eventName"
              name="eventName"
              type="text"
              required
              value={form.eventName}
              onChange={handleChange}
              placeholder="Woodinville Cookery Society — Summer Dinner"
              className="w-full border border-wcs-green/30 bg-white rounded px-3 py-2 text-wcs-green placeholder-wcs-green/30 focus:outline-none focus:border-wcs-copper"
            />
          </div>

          <div>
            <label className="block text-sm text-wcs-green mb-1" htmlFor="eventDate">
              Event Date <span className="text-wcs-copper">*</span>
            </label>
            <input
              id="eventDate"
              name="eventDate"
              type="date"
              required
              value={form.eventDate}
              onChange={handleChange}
              className="w-full border border-wcs-green/30 bg-white rounded px-3 py-2 text-wcs-green focus:outline-none focus:border-wcs-copper"
            />
          </div>

          <div>
            <label className="block text-sm text-wcs-green mb-1" htmlFor="hostNames">
              Host Name(s) <span className="text-wcs-copper">*</span>
            </label>
            <input
              id="hostNames"
              name="hostNames"
              type="text"
              required
              value={form.hostNames}
              onChange={handleChange}
              placeholder="Rob & Sarah Knox"
              className="w-full border border-wcs-green/30 bg-white rounded px-3 py-2 text-wcs-green placeholder-wcs-green/30 focus:outline-none focus:border-wcs-copper"
            />
          </div>

          <div>
            <label className="block text-sm text-wcs-green mb-1" htmlFor="teaserLine">
              Teaser Line <span className="text-wcs-copper">*</span>
              <span className="text-wcs-green/40 ml-2 font-normal">
                {form.teaserLine.length}/120
              </span>
            </label>
            <input
              id="teaserLine"
              name="teaserLine"
              type="text"
              required
              maxLength={120}
              value={form.teaserLine}
              onChange={handleChange}
              placeholder="Something delicious is coming."
              className="w-full border border-wcs-green/30 bg-white rounded px-3 py-2 text-wcs-green placeholder-wcs-green/30 focus:outline-none focus:border-wcs-copper"
            />
          </div>

          <div>
            <label className="block text-sm text-wcs-green mb-1" htmlFor="heroImage">
              Hero Image <span className="text-wcs-green/40 font-normal">(optional, max 10MB)</span>
            </label>
            <input
              id="heroImage"
              name="heroImage"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="w-full text-sm text-wcs-green/60 file:mr-3 file:py-1 file:px-3 file:border file:border-wcs-green/30 file:rounded file:bg-white file:text-wcs-green file:text-sm file:cursor-pointer hover:file:border-wcs-copper"
            />
          </div>

          <div>
            <label className="block text-sm text-wcs-green mb-1" htmlFor="guestEmails">
              Guest Emails <span className="text-wcs-copper">*</span>
              <span className="text-wcs-green/40 ml-2 font-normal">one per line</span>
            </label>
            <textarea
              id="guestEmails"
              name="guestEmails"
              required
              rows={8}
              value={form.guestEmails}
              onChange={handleChange}
              placeholder={"alice@example.com\nbob@example.com\ncarol@example.com"}
              className="w-full border border-wcs-green/30 bg-white rounded px-3 py-2 text-wcs-green placeholder-wcs-green/30 focus:outline-none focus:border-wcs-copper font-mono text-sm"
            />
            {form.guestEmails && (
              <p className="text-xs text-wcs-green/50 mt-1">
                {parseEmails(form.guestEmails).length} valid email{parseEmails(form.guestEmails).length !== 1 ? 's' : ''} detected
              </p>
            )}
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-wcs-green text-wcs-cream py-3 rounded font-sans text-sm tracking-wide hover:bg-wcs-green/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Sending…' : 'Send Save the Date'}
          </button>
        </form>
      </main>
    </div>
  )

  function parseEmails(raw) {
    return raw
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.includes('@'))
  }
}

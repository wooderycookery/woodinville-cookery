import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  })
}

export default function EventLanding() {
  const { eventId } = useParams()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function fetchEvent() {
      const { data, error } = await supabase
        .from('events')
        .select('id, name, date, host_id, vibe')
        .eq('id', eventId)
        .single()

      if (error || !data) {
        setNotFound(true)
      } else {
        setEvent(data)
      }
      setLoading(false)
    }
    fetchEvent()
  }, [eventId])

  if (loading) {
    return (
      <div className="min-h-screen bg-wcs-cream flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-wcs-green/20 border-t-wcs-green rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-wcs-cream flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-serif text-xl text-wcs-green">Event not found.</p>
          <p className="text-wcs-green/50 text-sm mt-2">Check your invitation link and try again.</p>
        </div>
      </div>
    )
  }

  const heroUrl = event.vibe?.startsWith('http') ? event.vibe : null

  return (
    <div className="min-h-screen bg-wcs-cream">
      <div className="max-w-lg mx-auto px-6 py-10">

        {/* Wordmark */}
        <div className="text-center mb-10">
          <p className="text-wcs-copper tracking-[0.25em] text-xs uppercase">
            Woodinville Cookery Society
          </p>
        </div>

        {/* Hero image */}
        {heroUrl && (
          <div className="mb-8 rounded-lg overflow-hidden">
            <img
              src={heroUrl}
              alt={event.name}
              className="w-full object-cover max-h-72"
            />
          </div>
        )}

        {/* Event details */}
        <div className="text-center space-y-4 mb-10">
          <h1 className="font-serif text-3xl text-wcs-green leading-tight">
            {event.name}
          </h1>

          <p className="text-wcs-copper font-sans text-sm tracking-wide font-medium">
            {formatDate(event.date)}
          </p>

          {event.hostName && (
            <p className="text-wcs-green/70 text-sm">
              Hosted by {event.hostName}
            </p>
          )}

          {event.teaserLine && (
            <p className="text-wcs-green/80 italic font-serif text-lg">
              {event.teaserLine}
            </p>
          )}
        </div>

        {/* Holding message */}
        <div className="border border-wcs-green/15 rounded-lg bg-white px-6 py-6 text-center">
          <p className="text-wcs-green font-serif text-lg mb-1">
            You're on the list.
          </p>
          <p className="text-wcs-green/60 text-sm">
            Full invitation and details coming soon.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-wcs-green/30 text-xs tracking-widest uppercase">
            Woodinville Cookery Society
          </p>
        </div>

      </div>
    </div>
  )
}

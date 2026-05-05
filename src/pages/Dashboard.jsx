import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-wcs-cream">
      <header className="border-b border-wcs-green/10 bg-white px-6 py-4 flex items-center justify-between">
        <h1 className="font-serif text-xl text-wcs-green">Woodinville Cookery Society</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-wcs-green/60 hover:text-wcs-green transition-colors"
        >
          Log out
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <h2 className="font-serif text-2xl text-wcs-green mb-2">Host Dashboard</h2>
        <p className="text-wcs-green/60 text-sm mb-10">Welcome back.</p>

        <div className="grid gap-4">
          <Link
            to="/dashboard/save-the-date"
            className="block border border-wcs-green/20 bg-white rounded-lg px-6 py-5 hover:border-wcs-copper transition-colors group"
          >
            <p className="text-wcs-copper text-xs tracking-widest uppercase mb-1">Step 1</p>
            <h3 className="font-serif text-lg text-wcs-green group-hover:text-wcs-copper transition-colors">
              Send Save the Date
            </h3>
            <p className="text-wcs-green/60 text-sm mt-1">
              Claim the date with a warm first message to your guest list.
            </p>
          </Link>
        </div>
      </main>
    </div>
  )
}

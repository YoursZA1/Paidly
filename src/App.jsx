import './App.css'
import '@/styles/animations.css'
import { Analytics } from "@vercel/analytics/react"
import Pages from "@/pages/index.jsx"
import UpgradeModalHost from "@/components/subscription/UpgradeModalHost"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
function App() {
  return (
    <>
      <Pages />
      <UpgradeModalHost />
      <Toaster />
      <SonnerToaster position="top-center" closeButton />
      {/* Vercel Web Analytics: production bundles only (avoids extra scripts/noise in local dev). */}
      {import.meta.env.PROD ? <Analytics /> : null}
    </>
  )
}

export default App
import './App.css'
import '@/styles/animations.css'
import { useEffect } from "react"
import { Analytics } from "@vercel/analytics/react"
import Pages from "@/pages/index.jsx"
import UpgradeModalHost from "@/components/subscription/UpgradeModalHost"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { connectExcelDatabase } from "@/services/ExcelDatabaseService"
import PaymentReminderScheduler from "@/components/reminders/PaymentReminderScheduler"

function App() {
  useEffect(() => {
    connectExcelDatabase({ url: "/paidly_data.xlsx" }).catch(() => {
      // ignore bootstrap errors
    });
  }, []);

  return (
    <>
      <Pages />
      <UpgradeModalHost />
      <PaymentReminderScheduler />
      <Toaster />
      <SonnerToaster position="top-center" closeButton />
      {/* Vercel Web Analytics: production bundles only (avoids extra scripts/noise in local dev). */}
      {import.meta.env.PROD ? <Analytics /> : null}
    </>
  )
}

export default App
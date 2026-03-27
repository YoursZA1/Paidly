import './App.css'
import '@/styles/animations.css'
import { useEffect } from "react"
import { Analytics } from "@vercel/analytics/react"
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
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
      <PaymentReminderScheduler />
      <Toaster />
      {/* Vercel Web Analytics: production bundles only (avoids extra scripts/noise in local dev). */}
      {import.meta.env.PROD ? <Analytics /> : null}
    </>
  )
}

export default App
import './App.css'
import '@/styles/animations.css'
import { useEffect } from "react"
import { Analytics } from "@vercel/analytics/react"
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import { connectExcelDatabase } from "@/services/ExcelDatabaseService"

function App() {
  useEffect(() => {
    connectExcelDatabase({ url: "/paidly_data.xlsx" }).catch(() => {
      // ignore bootstrap errors
    });
  }, []);

  return (
    <>
      <Pages />
      <Toaster />
      <Analytics />
    </>
  )
}

export default App
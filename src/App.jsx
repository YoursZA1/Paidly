import './App.css'
import '@/styles/animations.css'
import { useEffect } from "react"
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"
import { connectExcelDatabase } from "@/services/ExcelDatabaseService"

function App() {
  useEffect(() => {
    connectExcelDatabase({ url: "/invoicebreek_data.xlsx" }).catch(() => {
      // ignore bootstrap errors
    });
  }, []);

  return (
    <>
      <Pages />
      <Toaster />
    </>
  )
}

export default App
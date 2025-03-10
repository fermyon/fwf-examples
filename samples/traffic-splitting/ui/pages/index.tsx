import { useEffect, useState } from "react"
import { useRouter } from "next/router"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

export default function Index() {
  const router = useRouter()
  const [isRouting, setIsRouting] = useState(true)

  useEffect(() => {
    // Check if we're trying to access a dashboard directly
    const path = window.location.pathname
    
    if (path.startsWith('/dashboard/')) {
      // Extract the appId from the URL
      const appId = path.split('/')[2]
      
      // Manually navigate to the dashboard with the appId
      if (appId) {
        router.push(`/dashboard/${appId}`)
      } else {
        router.push("/applications")
      }
    } else {
      // Otherwise redirect to applications as before
      router.push("/applications")
    }
  }, [router])

  return <LoadingSpinner variant="full" text="Loading application..." />
}

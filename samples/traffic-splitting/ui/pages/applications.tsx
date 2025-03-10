"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/router"
import Layout from "@/components/Layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { EyeIcon, EyeOffIcon, Copy, MoreVertical, Trash2, AppWindow, PlusCircle } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

interface Application {
  id: string
  name: string
  url: string
  apiKey: string
}

export default function Applications() {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [visibleApiKeys, setVisibleApiKeys] = useState<Record<string, boolean>>({})
  const [appToDelete, setAppToDelete] = useState<Application | null>(null)
  const router = useRouter()

  useEffect(() => {
    const fetchApps = async () => {
      try {
        const response = await fetch(`/api/apps`, {
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-store',
            'Pragma': 'no-cache',
          },
        })
        
        if (response.status === 403) {
          toast({
            title: "Unauthorized",
            description: "You don't have permission to view these applications.",
            variant: "destructive",
          })
          setApps([])
          setLoading(false)
          return
        }
        
        if (!response.ok) {
          throw new Error('Failed to fetch applications')
        }
        
        const data = await response.json()
        setApps(data)
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load applications. Please try again.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchApps()
  }, [])

  if (loading) {
    return <LoadingSpinner variant="full" text="Loading applications..." />
  }

  const handleRowClick = (appId: string) => {
    router.push(`/dashboard/${appId}`)
  }

  const toggleApiKeyVisibility = (e: React.MouseEvent, appId: string) => {
    e.stopPropagation() // Prevent row click when clicking the eye icon
    setVisibleApiKeys(prev => ({
      ...prev,
      [appId]: !prev[appId]
    }))
  }

  const copyTrafficDataCommand = (e: React.MouseEvent, app: Application) => {
    e.stopPropagation()
    const curlCommand = `curl -X POST "${window.location.origin}/api/logger/${app.id}" \\
  -H "Authorization: Bearer ${app.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello World"}'`
    
    navigator.clipboard.writeText(curlCommand)
    toast({
      title: "Copied!",
      description: "cURL command copied to clipboard",
    })
  }

  const handleDelete = async (app: Application) => {
    try {
      await fetch(`/api/apps/${app.id}`, {
        method: 'DELETE',
      })
      setApps(apps.filter(a => a.id !== app.id))
      toast({
        title: "Application deleted",
        description: `${app.name} has been deleted successfully.`,
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete the application.",
        variant: "destructive",
      })
    }
    setAppToDelete(null)
  }

  return (
    <Layout>
      <div className="container max-w-6xl mx-auto py-10">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-semibold">Applications</h1>
          <Button onClick={() => router.push("/register")}>
            Add New...
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {apps.map((app) => (
            <div
              key={app.id}
              onClick={() => handleRowClick(app.id)}
              className="p-6 rounded-lg border bg-card hover:shadow-md hover:border-primary/30 transition-all flex flex-col h-[280px]"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <div className="w-5 h-5 bg-primary/80 rounded-sm" />
                  </div>
                  <div>
                    <h2 className="font-medium">{app.name}</h2>
                    <p className="text-sm text-muted-foreground">{app.url}</p>
                  </div>
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        setAppToDelete(app)
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-auto space-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">API Key</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">
                      {visibleApiKeys[app.id] ? app.apiKey : '••••••••'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => toggleApiKeyVisibility(e, app.id)}
                      className="h-6 w-6"
                    >
                      {visibleApiKeys[app.id] ? (
                        <EyeOffIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-muted-foreground mb-1">Traffic Data URL</p>
                  <div className="flex items-center gap-2">
                    <span className="truncate">
                      {`${window.location.origin}/api/logger/${app.id}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => copyTrafficDataCommand(e, app)}
                      className="h-6 w-6 flex-shrink-0"
                      title="Copy cURL command"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {apps.length === 0 && !loading && (
          <div className="text-center py-16 px-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AppWindow className="h-8 w-8 text-primary/80" />
            </div>
            <h3 className="text-xl font-medium mb-2">No applications yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Register your first application to start monitoring HTTP traffic and gain valuable insights.
            </p>
            <Button
              onClick={() => router.push("/register")}
              className="px-6"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Create your first application
            </Button>
          </div>
        )}

        <AlertDialog open={!!appToDelete} onOpenChange={() => setAppToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {appToDelete?.name} and all of its data.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => appToDelete && handleDelete(appToDelete)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  )
}

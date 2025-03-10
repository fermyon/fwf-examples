"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/router"
import Layout from "@/components/Layout"
import HTTPRequestDashboard from "@/components/http-request-dashboard"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EyeIcon, EyeOffIcon, Copy, MoreVertical, Trash2, RefreshCw } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { CodeBlock } from "@/components/ui/code-block"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

interface Application {
    id: string;
    name: string;
    createdAt: string;
    url: string;
    loggerUrl: string;
    apiKey: string;
}

export default function ApplicationDashboard() {
  const router = useRouter()
  const [app, setApp] = useState<Application | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showDeleteAlert, setShowDeleteAlert] = useState(false)
  const [exampleCode, setExampleCode] = useState("")

  useEffect(() => {
    async function fetchApp() {
      if (router.isReady) {
        const appId = router.query.appId as string
        console.log(`Fetching app with id: ${appId}`)
        try {
          setError(null)
          const response = await fetch(`/api/apps/${appId}`, {
            credentials: 'include', // Important for auth cookies
          })
          
          if (response.status === 403) {
            setError('You do not have permission to access this application')
            setApp(null)
            setIsLoading(false)
            return
          }
          
          if (!response.ok) {
            console.error(`Failed to fetch application: ${response.statusText}`)
            throw new Error(`Failed to fetch application: ${response.statusText}`)
          }
          
          const appData = await response.json()
          console.log(`App data: ${JSON.stringify(appData)}`)
          if (!appData) {
            throw new Error('No application data received')
          }
          setApp(appData)
        } catch (error) {
          console.error('Error fetching application:', error)
          setError(error instanceof Error ? error.message : 'An unknown error occurred')
          setApp(null)
        } finally {
          setIsLoading(false)
        }
      }
    }

    fetchApp()
  }, [router.isReady, router.query.appId])

  useEffect(() => {
    // Generate the code template only on the client side
    const code = `// Wasm function to mirror traffic

router.all('*', async (request: Request, _event: FetchEvent) => {
    let [forward, log] = request.body?.tee() ?? [null, null];

    let upstreamRequest = new Request(
        '${app?.url}', 
        { body: forward, 
        method: request.method, 
        headers: request.headers });

    let upstreamPromise = fetch(upstreamRequest);
    let headers = new Headers(request.headers);
    headers.set('Authorization', 'Bearer ${app?.apiKey}');

    let loggerPromise = fetch(
        '${window.location.origin}/api/logger/${app?.id}',
        { body: log, 
         method: request.method, 
         headers: headers });

    return await upstreamPromise;
});`
    setExampleCode(code)
  }, [app]) // Update when app data changes

  const toggleApiKeyVisibility = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowApiKey(!showApiKey)
  }

  const copyTrafficDataCommand = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!app) return
    
    // Generate unique IDs for each copy operation
    const requestId = `req-${crypto.randomUUID().slice(0, 8)}`
    const responseId = `res-${crypto.randomUUID().slice(0, 8)}`
    
    const requestCurlCommand = `curl -X POST "${window.location.origin}/api/logger/request/${app.id}" \\
-H "Authorization: Bearer ${app.apiKey}" \\
-H "Content-Type: application/json" \\
-d '{
  "appId": "${app.id}",
  "id": "${requestId}",
  "timestamp": "${new Date().toISOString()}",
  "url": "https://example.com/api/resource",
  "method": "GET",
  "headers": ["Content-Type: application/json", "User-Agent: curl/7.64.1"],
  "bodyLength": 0
}'`

    const responseCurlCommand = `curl -X POST "${window.location.origin}/api/logger/response/${app.id}" \\
-H "Authorization: Bearer ${app.apiKey}" \\
-H "Content-Type: application/json" \\
-d '{
  "id": "${responseId}",
  "requestId": "${requestId}",
  "appId": "${app.id}",
  "timestamp": "${new Date().toISOString()}",
  "statusCode": 200,
  "headers": ["Content-Type: application/json", "Server: nginx/1.19.0"],
  "bodyLength": 42
}'`
    
    const fullCommand = `# Request Metadata\n${requestCurlCommand}\n\n# Response Metadata\n${responseCurlCommand}`
    
    navigator.clipboard.writeText(fullCommand)
    toast({
      title: "Copied!",
      description: "Request and response cURL commands copied to clipboard",
    })
  }

  const handleDelete = async () => {
    if (!app) return
    try {
      const response = await fetch(`/api/apps/${app.id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error('Failed to delete application')
      }
      toast({
        title: "Application deleted",
        description: `${app.name} has been deleted successfully.`,
      })
      router.push('/applications')
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete the application.",
        variant: "destructive",
      })
    }
    setShowDeleteAlert(false)
  }

  const regenerateApiKey = async () => {
    if (!app) return
    try {
      const response = await fetch(`/api/apps/${app.id}/regenerate-key`, {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error('Failed to regenerate API key')
      }
      const updatedApp = await response.json()
      setApp(updatedApp)
      setShowApiKey(true) // Show the new key automatically
      toast({
        title: "API Key Regenerated",
        description: "Your new API key has been generated successfully.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to regenerate API key.",
        variant: "destructive",
      })
    }
  }

  if (!router.isReady || isLoading) {
    return (
      <Layout>
        <div className="container mx-auto py-8">
          <LoadingSpinner 
            variant="skeleton" 
            text="Loading application dashboard..." 
            count={5}
          />
        </div>
      </Layout>
    )
  }

  if (error || !app) {
    return (
      <Layout>
        <div className="text-center p-4 text-red-600">
          {error || 'Error loading application'}
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{app.name}</CardTitle>
                <CardDescription>{app.url}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8">
                      Connection Instructions
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[1000px] max-h-[80vh] flex flex-col">
                    <DialogHeader className="flex-shrink-0">
                      <DialogTitle>How to Connect Your Application</DialogTitle>
                    </DialogHeader>

                    <div className="flex justify-center pt-4 border-t">
                      <a
                        href="https://github.com/fermyon/fwaffic-sample"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center"
                      >
                        <Button variant="outline" className="gap-2">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                          </svg>
                          View Complete Sample on GitHub
                        </Button>
                      </a>
                    </div>
                    
                    <div className="space-y-6 overflow-y-auto pr-2">
                      <div>
                        <h3 className="text-sm font-medium mb-2">Environment Variables</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Set these environment variables before deploying your traffic splitting application:
                        </p>
                        <div className="hidden" id="full-env-vars-code">
                          {`# Required environment variables for traffic splitting
export SPIN_VARIABLE_UPSTREAM_URL="${app?.url}"
export SPIN_VARIABLE_FWAFFIC_URL="${window.location.origin}"
export SPIN_VARIABLE_FWAFFIC_APP_ID="${app?.id}"
export SPIN_VARIABLE_FWAFFIC_KEY="${app?.apiKey}"

# Deploy your application with these variables
spin deploy --variable upstream_url=$SPIN_VARIABLE_UPSTREAM_URL \\
  --variable fwaffic_url=$SPIN_VARIABLE_FWAFFIC_URL \\
  --variable fwaffic_app_id=$SPIN_VARIABLE_FWAFFIC_APP_ID \\
  --variable fwaffic_key=$SPIN_VARIABLE_FWAFFIC_KEY`}
                        </div>
                        <div className="relative">
                          <CodeBlock
                            language="bash"
                            code={`# Required environment variables for traffic splitting
export SPIN_VARIABLE_UPSTREAM_URL="${app?.url}"
export SPIN_VARIABLE_FWAFFIC_URL="${window.location.origin}"
export SPIN_VARIABLE_FWAFFIC_APP_ID="${app?.id}"
export SPIN_VARIABLE_FWAFFIC_KEY="${showApiKey ? app?.apiKey : '••••••••••••••••••••••••••••••••'}"

# Deploy your application with these variables
spin deploy --variable upstream_url=$SPIN_VARIABLE_UPSTREAM_URL \\
  --variable fwaffic_url=$SPIN_VARIABLE_FWAFFIC_URL \\
  --variable fwaffic_app_id=$SPIN_VARIABLE_FWAFFIC_APP_ID \\
  --variable fwaffic_key=$SPIN_VARIABLE_FWAFFIC_KEY`}
                            showCopy={true}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute right-3 top-3 text-white hover:text-white hover:bg-white/10 z-10"
                            onClick={() => {
                              const fullCode = document.getElementById('full-env-vars-code')?.textContent || '';
                              navigator.clipboard.writeText(fullCode);
                              toast({
                                title: "Copied!",
                                description: "Environment variables copied to clipboard",
                              });
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex justify-end mt-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={toggleApiKeyVisibility}
                            className="text-xs h-7 gap-1"
                          >
                            {showApiKey ? (
                              <>
                                <EyeOffIcon className="h-3 w-3" />
                                Hide API Key
                              </>
                            ) : (
                              <>
                                <EyeIcon className="h-3 w-3" />
                                Show API Key
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={regenerateApiKey}
                            className="text-xs h-7 gap-1"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Regenerate API Key
                          </Button>
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-medium mb-2">Wasm Function</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          To start mirroring traffic, create a Wasm function.
                        </p>
                        <CodeBlock
                          language="typescript"
                          code={exampleCode}
                          showCopy={true}
                        />
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        <p>After adding the code:</p>
                        <ol className="list-decimal list-inside space-y-2 mt-2">
                          <li>Set the environment variables shown above</li>
                          <li>Deploy your application with Spin</li>
                          <li>Traffic will automatically be mirrored to FWaFfic</li>
                        </ol>
                      </div>
                      
                      <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-md border border-blue-200 dark:border-blue-800">
                        <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">About Traffic Splitting</h4>
                        <p className="text-sm text-blue-700 dark:text-blue-400">
                          The traffic splitting component forwards requests to your upstream service while simultaneously sending request and response metadata to FWaFfic for monitoring and analysis.
                        </p>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteAlert(true)}
                  className="h-8"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Application
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Traffic Data URL</p>
                <div className="flex items-center gap-2">
                  <span className="truncate">
                    {`${window.location.origin}/api/logger/${app.id}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyTrafficDataCommand}
                    className="h-6 w-6 flex-shrink-0"
                    title="Copy cURL commands to send request/response pairs"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {app?.name} and all of its data.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={handleDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {app.id && <HTTPRequestDashboard appId={app.id} appName={app.name} appUrl={app.url} />}
      </div>
    </Layout>
  )
}

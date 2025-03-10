import type React from "react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Github, BarChart2, Shield, Code, ChevronDown, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GitHubLoginButton } from "@/components/GitHubLoginButton"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface User {
  login: string;
  avatar_url: string;
  last_signin_at?: string;
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch(`/api/auth/user`, {
          credentials: 'include'
        });
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  const handleLogin = () => {
    window.location.href = `/api/auth/github`;
  };

  const handleLogout = () => {
    window.location.href = `/api/auth/logout`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <Link href="/" className="text-2xl font-bold text-primary flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">FW</span>
              </div>
              FWaFfic
            </Link>
            
            <div className="flex items-center gap-6">
              {user && (
                <ul className="hidden md:flex items-center space-x-6">
                  <li>
                    <Link href="/applications" className="text-foreground/80 hover:text-primary transition-colors">
                      Applications
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="text-foreground/80 hover:text-primary transition-colors">
                      Register New App
                    </Link>
                  </li>
                </ul>
              )}
              
              {!loading && (
                <div>
                  {user ? (
                    <div className="flex items-center gap-3 border rounded-full pl-2 pr-1 py-1 hover:border-primary/50 transition-colors">
                      <img src={user.avatar_url} alt={user.login} className="w-7 h-7 rounded-full" />
                      <span className="text-sm font-medium mr-1 hidden sm:inline">{user.login}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={handleLogout} className="text-red-500 focus:text-red-500">
                            <LogOut className="h-4 w-4 mr-2" />
                            Logout
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <GitHubLoginButton variant="default" size="sm" />
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Mobile menu for authenticated users */}
          {user && (
            <div className="md:hidden pt-2 pb-1">
              <div className="flex space-x-4 border-t pt-2">
                <Link href="/applications" className="text-sm text-foreground/80 hover:text-primary transition-colors">
                  Applications
                </Link>
                <Link href="/register" className="text-sm text-foreground/80 hover:text-primary transition-colors">
                  Register New App
                </Link>
              </div>
            </div>
          )}
        </nav>
      </header>
      
      <main className="container mx-auto px-4 py-8 flex-1">
        {!user && !loading ? (
          <div className="max-w-6xl mx-auto">
            {/* Hero Section */}
            <div className="py-16 md:py-24 text-center">
              <h1 className="text-4xl md:text-6xl font-bold mb-6">Traffic Mirroring Made Simple</h1>
              <p className="text-xl text-muted-foreground mb-10 max-w-3xl mx-auto">
                FWaFfic helps you monitor, analyze, and debug HTTP traffic with ease. Mirror your application's traffic and gain valuable insights.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <GitHubLoginButton size="lg" />
                <Link href="https://github.com/fermyon/fwaffic" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="lg" className="gap-2">
                    <Github className="h-5 w-5" />
                    View on GitHub
                  </Button>
                </Link>
              </div>
            </div>

            <div className="py-8 px-6 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 mb-16">
              <div className="flex items-start">
                <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-full mr-4 mt-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 dark:text-blue-400">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 16v-4"></path>
                    <path d="M12 8h.01"></path>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">FWaFfic is a Demo Showcase</h3>
                  <p className="text-blue-700 dark:text-blue-400 mb-3">
                    FWaFfic is a demonstration backend for traffic mirroring, intended as a showcase of what's possible with WebAssembly-powered traffic splitting.
                  </p>
                  <p className="text-blue-700 dark:text-blue-400 mb-3">
                    In production environments, you can integrate with your existing security, monitoring, or logging systems. Fermyon Wasm Functions can split traffic and send to all of them simultaneously.
                  </p>
                  <p className="text-blue-700 dark:text-blue-400">
                    This flexibility allows you to leverage your current infrastructure while gaining the benefits of WebAssembly's performance and security.
                  </p>
                </div>
              </div>
            </div>

            {/* Problem Section */}
            <div className="py-16 bg-muted/30 rounded-lg p-8">
              <h2 className="text-3xl font-bold text-center mb-8">The Challenge of Traffic Mirroring</h2>
              
              <div className="prose prose-lg max-w-4xl mx-auto">
                <p className="text-lg mb-6">
                  Organizations often need to duplicate (tee) traffic to additional destinations beyond their origin servers. 
                  This is critical for:
                </p>
                
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 list-none pl-0">
                  <li className="bg-card p-4 rounded-lg border flex items-start">
                    <div className="bg-primary/10 p-2 rounded-full mr-3 mt-1">
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <strong>Audit Logging</strong>
                      <p className="text-muted-foreground mt-1">Maintain comprehensive records of all system interactions</p>
                    </div>
                  </li>
                  <li className="bg-card p-4 rounded-lg border flex items-start">
                    <div className="bg-primary/10 p-2 rounded-full mr-3 mt-1">
                      <Code className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <strong>Regulatory Compliance</strong>
                      <p className="text-muted-foreground mt-1">Meet legal requirements for data handling and storage</p>
                    </div>
                  </li>
                  <li className="bg-card p-4 rounded-lg border flex items-start">
                    <div className="bg-primary/10 p-2 rounded-full mr-3 mt-1">
                      <Shield className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <strong>Security Analysis</strong>
                      <p className="text-muted-foreground mt-1">Detect and respond to potential security threats</p>
                    </div>
                  </li>
                  <li className="bg-card p-4 rounded-lg border flex items-start">
                    <div className="bg-primary/10 p-2 rounded-full mr-3 mt-1">
                      <BarChart2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <strong>Fraud Detection</strong>
                      <p className="text-muted-foreground mt-1">Identify suspicious patterns in real-time</p>
                    </div>
                  </li>
                </ul>
                
                <h3 className="text-xl font-semibold mb-4">What organizations need is a solution that is:</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="bg-background p-5 rounded-lg border">
                    <h4 className="font-semibold text-lg mb-2">Cost-efficient</h4>
                    <p className="text-muted-foreground">Minimizes additional infrastructure costs with fair, per-invocation pricing</p>
                  </div>
                  <div className="bg-background p-5 rounded-lg border">
                    <h4 className="font-semibold text-lg mb-2">Fast</h4>
                    <p className="text-muted-foreground">Handles traffic duplication efficiently without adding latency to the main request path</p>
                  </div>
                  <div className="bg-background p-5 rounded-lg border">
                    <h4 className="font-semibold text-lg mb-2">Flexible</h4>
                    <p className="text-muted-foreground">Gives full control over when and where traffic is duplicated based on custom rules</p>
                  </div>
                  <div className="bg-background p-5 rounded-lg border">
                    <h4 className="font-semibold text-lg mb-2">Adaptable</h4>
                    <p className="text-muted-foreground">Works seamlessly beyond just the origin server if desired, integrating with existing systems</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Solution Section */}
            <div className="py-16">
              <h2 className="text-3xl font-bold text-center mb-8">Traffic Mirroring with Fermyon Wasm Functions</h2>
              
              <div className="flex flex-col md:flex-row gap-8 items-center mb-12">
                <div className="md:w-1/2">
                  <p className="text-lg mb-6">
                    Fermyon Wasm Functions can be configured as the entrypoint for requests to your application, and it can mirror HTTP requests to integrate with your existing systems.
                  </p>
                  <p className="text-lg mb-6">
                    This powerful approach gives you complete control over your traffic mirroring strategy while maintaining performance and reliability.
                  </p>
                </div>
                <div className="md:w-1/2 bg-muted p-6 rounded-lg">
                  <div className="aspect-video relative bg-card rounded-md border overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center p-4">
                        <p className="text-sm text-muted-foreground mb-2">Diagram: Traffic Mirroring Architecture</p>
                        <p className="text-xs text-muted-foreground">Client → Fermyon Wasm Functions → Origin</p>
                        <p className="text-xs text-muted-foreground">↓</p>
                        <p className="text-xs text-muted-foreground">Data Store</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <h3 className="text-2xl font-semibold text-center mb-6">Benefits of Using Fermyon Wasm Functions</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-card p-6 rounded-lg border">
                  <h4 className="font-semibold text-lg mb-3">Zero Cold Starts</h4>
                  <p className="text-muted-foreground">WebAssembly functions start instantly, ensuring no delay in processing your traffic</p>
                </div>
                <div className="bg-card p-6 rounded-lg border">
                  <h4 className="font-semibold text-lg mb-3">Edge Network Integration</h4>
                  <p className="text-muted-foreground">Run within the Akamai network, close to your users for minimal latency</p>
                </div>
                <div className="bg-card p-6 rounded-lg border">
                  <h4 className="font-semibold text-lg mb-3">Conditional Logic</h4>
                  <p className="text-muted-foreground">Implement custom rules for when and how to mirror traffic based on your needs</p>
                </div>
                <div className="bg-card p-6 rounded-lg border">
                  <h4 className="font-semibold text-lg mb-3">Content Transformation</h4>
                  <p className="text-muted-foreground">Manipulate headers or body content as part of mirroring the requests</p>
                </div>
                <div className="bg-card p-6 rounded-lg border">
                  <h4 className="font-semibold text-lg mb-3">Flexible Storage Options</h4>
                  <p className="text-muted-foreground">Integrate with the datastore of your choice (Object stores, databases, etc.)</p>
                </div>
                <div className="bg-card p-6 rounded-lg border">
                  <h4 className="font-semibold text-lg mb-3">Multi-language Support</h4>
                  <p className="text-muted-foreground">Implement logic in various programming languages (JavaScript/TypeScript, Rust, and more)</p>
                </div>
              </div>
            </div>

            <div className="py-16">
              <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="flex flex-col items-center text-center">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-4">
                    1
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Register Your App</h3>
                  <p className="text-muted-foreground">
                    Create an account and register your application to get your unique API key.
                  </p>
                </div>
                
                <div className="flex flex-col items-center text-center">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-4">
                    2
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Integrate Our Code</h3>
                  <p className="text-muted-foreground">
                    Add our WebAssembly-based service worker to your application with a few lines of code.
                  </p>
                </div>
                
                <div className="flex flex-col items-center text-center">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-4">
                    3
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Analyze Traffic</h3>
                  <p className="text-muted-foreground">
                    Start monitoring your HTTP traffic with detailed analytics and insights.
                  </p>
                </div>
              </div>
            </div>

            <div className="py-16 text-center">
              <div className="p-8 rounded-lg bg-primary/5 border border-primary/20">
                <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
                <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                  Sign in with GitHub to start monitoring your application's traffic today.
                </p>
                <GitHubLoginButton size="lg" />
              </div>
            </div>
          </div>
        ) : (
          children
        )}
      </main>
      
      <footer className="border-t py-6 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} FWaFfic. All rights reserved.
        </div>
      </footer>
    </div>
  )
}

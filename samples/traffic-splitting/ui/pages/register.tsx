"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/router"
import Layout from "@/components/Layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"

export default function RegisterApplication() {
  const [appName, setAppName] = useState("")
  const [appUrl, setAppUrl] = useState("")
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const response = await fetch(`/api/apps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: appName,
          url: appUrl,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to register application')
      }

      toast({
        title: "Application Registered",
        description: `Your application "${appName}" has been registered successfully.`,
      })

      router.push("/applications")
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to register application. Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center">Register New Application</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Application Details</CardTitle>
            <CardDescription>
              Enter the details of the application you want to monitor
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="appName">Application Name</Label>
                <Input
                  id="appName"
                  placeholder="My Awesome App"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  required
                  className="focus:border-primary"
                />
                <p className="text-xs text-muted-foreground">
                  A descriptive name to identify your application
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="appUrl">Application URL</Label>
                <Input
                  id="appUrl"
                  placeholder="https://myapp.com"
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  required
                  className="focus:border-primary"
                />
                <p className="text-xs text-muted-foreground">
                  The base URL of your application that will receive the traffic
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full">
                Register Application
              </Button>
            </CardFooter>
          </form>
        </Card>
        
        <div className="mt-6 text-center">
          <Button variant="link" onClick={() => router.push("/applications")}>
            Back to Applications
          </Button>
        </div>
      </div>
    </Layout>
  )
}

"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "spinner" | "skeleton" | "full"
  text?: string
  count?: number
}

export function LoadingSpinner({
  variant = "spinner",
  text = "Loading...",
  count = 3,
  className,
  ...props
}: LoadingSpinnerProps) {
  if (variant === "full") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-50">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg font-medium">{text}</p>
      </div>
    )
  }
  
  return (
    <div 
      className={cn(
        "flex flex-col items-center justify-center p-6 space-y-4", 
        className
      )}
      {...props}
    >
      {variant === "spinner" && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{text}</p>
        </>
      )}
      
      {variant === "skeleton" && (
        <div className="w-full space-y-3">
          <div className="flex justify-center mb-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[80%]" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 

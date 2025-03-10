import React, { useEffect } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from "@/lib/utils"
import { Button } from "./button"
import Prism from 'prismjs'
import 'prismjs/themes/prism-okaidia.css' // Changed theme for better TOML support
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-toml'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-yaml'

interface CodeBlockProps {
  language: string
  code: string
  showCopy?: boolean
  className?: string
}

export function CodeBlock({
  language,
  code,
  showCopy = true,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      Prism.highlightAll()
    }
  }, [code])

  const onCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn("relative group", className)}>
      <pre className="overflow-x-auto p-4 rounded-lg bg-[#1e1e1e] text-sm">
        <code className={`language-${language}`}>
          {code}
        </code>
      </pre>
      {showCopy && (
        <Button
          size="icon"
          variant="ghost"
          className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity text-white hover:text-white hover:bg-white/10"
          onClick={onCopy}
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  )
} 

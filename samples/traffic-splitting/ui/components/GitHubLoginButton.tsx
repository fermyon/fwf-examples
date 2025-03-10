import { Github } from "lucide-react"
import { Button, ButtonProps } from "@/components/ui/button"

interface GitHubLoginButtonProps extends ButtonProps {
  variant?: "default" | "outline" | "secondary"
  size?: "default" | "sm" | "lg"
  fullWidth?: boolean
}

export function GitHubLoginButton({
  variant = "default",
  size = "default",
  fullWidth = false,
  className,
  ...props
}: GitHubLoginButtonProps) {
  const handleLogin = () => {
    window.location.href = `/api/auth/github`
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleLogin}
      className={`${fullWidth ? "w-full" : ""} ${className || ""}`}
      {...props}
    >
      <Github className="mr-2 h-4 w-4" />
      Sign in with GitHub
    </Button>
  )
} 

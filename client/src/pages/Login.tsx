import React, { useState, useEffect } from "react";
import { Chrome } from "lucide-react";
import { AuthState } from "../App.tsx";
import logo from "../assets/logo.png";

interface LoginProps {
  onLogin: (authData: AuthState) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch google client ID configuration
    fetch("/api/config")
      .then(res => res.json())
      .then(data => {
        if (data.googleClientId) {
          setGoogleClientId(data.googleClientId);
          initializeGoogleSignIn(data.googleClientId);
        }
      })
      .catch(err => console.error("Error loading auth config:", err));
  }, []);

  const initializeGoogleSignIn = (clientId: string) => {
    const interval = setInterval(() => {
      if ((window as any).google?.accounts?.id) {
        clearInterval(interval);
        (window as any).google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCallback,
          auto_select: false
        });
        (window as any).google.accounts.id.renderButton(
          document.getElementById("google-signin-button"),
          { 
            theme: "outline", 
            size: "large", 
            width: 382,
            text: "signin_with",
            shape: "rectangular"
          }
        );
      }
    }, 100);
  };

  const handleGoogleCallback = async (response: any) => {
    setLoading(true);
    setError("");
    try {
      const fetchResponse = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleToken: response.credential })
      });
      const data = await fetchResponse.json();
      if (!fetchResponse.ok || !data.success) {
        throw new Error(data.error || "Google Sign-In failed");
      }
      onLogin({
        token: data.token,
        user: data.user
      });
    } catch (err: any) {
      setError(err.message || "Unable to complete Google authentication");
    } finally {
      setLoading(false);
    }
  };

  const performLogin = async (payload: { email: string; companyName: string; fullName?: string }) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Authentication failed");
      }
      onLogin({
        token: data.token,
        user: data.user
      });
    } catch (err: any) {
      setError(err.message || "Unable to reach authentication server");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address");
      return;
    }
    const defaultCompany = email.includes("@candidex.co.nz") ? "Candidex Recruitment" : companyName || "Candidex Recruitment";
    performLogin({ email, companyName: defaultCompany });
  };

  const handleQuickLogin = (userEmail: string, userName: string) => {
    performLogin({
      email: userEmail,
      companyName: "Candidex Recruitment",
      fullName: userName
    });
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 items-center justify-center p-4">
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="bg-card border border-border w-full max-w-md p-8 rounded-2xl shadow-xl relative z-10 hover-scale">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="mb-4">
            <img src={logo} alt="RefCheck Logo" className="w-20 h-20 object-contain mx-auto" />
          </div>
          <h1 className="text-2xl font-black font-display tracking-tight">RefCheck</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Automated reference checking SaaS for NZ/AU employers
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-lg border border-destructive/20 font-medium mb-6">
            {error}
          </div>
        )}

        {googleClientId ? (
          <div className="flex flex-col items-center w-full mb-6">
            <div id="google-signin-button" className="w-full flex justify-center"></div>
            {loading && <p className="text-xs text-muted-foreground mt-2 animate-pulse">Authenticating with Google...</p>}
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            <button
              onClick={() => handleQuickLogin("jenna@candidex.co.nz", "Jenna Robinson")}
              disabled={loading}
              className="flex items-center justify-center gap-3 w-full py-3 border border-primary/30 bg-primary/5 hover:bg-primary/10 rounded-xl text-sm font-semibold text-primary transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Chrome className="w-5 h-5 text-primary" />
              {loading ? "Authenticating..." : "Sign in as Jenna Robinson"}
            </button>
            <button
              onClick={() => handleQuickLogin("wayne@candidex.co.nz", "Wayne Sullivan")}
              disabled={loading}
              className="flex items-center justify-center gap-3 w-full py-3 border border-border bg-card hover:bg-secondary rounded-xl text-sm font-semibold transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Chrome className="w-5 h-5 text-primary" />
              {loading ? "Authenticating..." : "Sign in as Wayne Sullivan"}
            </button>
          </div>
        )}

        {!googleClientId && (
          <>
            <div className="relative flex py-3 items-center mb-6">
              <div className="flex-grow border-t border-border"></div>
              <span className="flex-shrink mx-4 text-xs font-semibold text-muted-foreground uppercase">Or Sign In by Email</span>
              <div className="flex-grow border-t border-border"></div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="e.g. jenna@candidex.co.nz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-secondary border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Company Name (Optional for Candidex)
                </label>
                <input
                  type="text"
                  placeholder="Candidex Recruitment"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-secondary border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-sm hover:opacity-90 shadow-md shadow-primary/10 transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? "Signing in..." : "Continue to Workspace"}
              </button>
            </form>
          </>
        )}

        <p className="text-center text-[10px] text-muted-foreground mt-8">
          RefCheck • NZ & AU Compliance Safeguarded
        </p>
      </div>
    </div>
  );
}

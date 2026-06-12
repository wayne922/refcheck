import React, { useState } from "react";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { Dashboard } from "./pages/Dashboard.tsx";
import { Login } from "./pages/Login.tsx";
import { Candidates } from "./pages/Candidates.tsx";
import { FormBuilder } from "./pages/FormBuilder.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { CandidateNominate } from "./pages/CandidateNominate.tsx";
import { RefereeForm } from "./pages/RefereeForm.tsx";
import { CandidateSubstitute } from "./pages/CandidateSubstitute.tsx";

export interface AuthState {
  token: string;
  user: {
    email: string;
    companyName: string;
    role?: string;
  };
}

export function App() {
  const [location] = useLocation();

  const [auth, setAuth] = useState<AuthState | null>(() => {
    const saved = localStorage.getItem("refcheck_auth");
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = (authData: AuthState) => {
    localStorage.setItem("refcheck_auth", JSON.stringify(authData));
    setAuth(authData);
  };

  const handleLogout = () => {
    localStorage.removeItem("refcheck_auth");
    setAuth(null);
  };

  const isRecruiterRoute = ["/dashboard", "/candidates", "/builder"].includes(location);

  return (
    <div className="flex min-h-screen bg-background text-foreground animate-fade-in">
      {auth && isRecruiterRoute && (
        <Sidebar user={auth.user} onLogout={handleLogout} />
      )}
      
      <main className="flex-1 flex flex-col min-w-0">
        <Switch>
          <Route path="/login">
            {auth ? <Redirect to="/dashboard" /> : <Login onLogin={handleLogin} />}
          </Route>
          
          <Route path="/dashboard">
            {!auth ? <Redirect to="/login" /> : <Dashboard auth={auth} />}
          </Route>
          
          <Route path="/candidates">
            {!auth ? <Redirect to="/login" /> : <Candidates auth={auth} />}
          </Route>
          
          <Route path="/builder">
            {!auth ? <Redirect to="/login" /> : <FormBuilder auth={auth} />}
          </Route>
          
          {/* Public Link-Based Token Routes */}
          <Route path="/c/:token">
            {({ token }) => <CandidateNominate token={token} />}
          </Route>
          
          <Route path="/c/:token/substitute">
            {({ token }) => <CandidateSubstitute token={token} />}
          </Route>
          
          <Route path="/r/:token">
            {({ token }) => <RefereeForm token={token} />}
          </Route>

          <Route path="/">
            <Redirect to={auth ? "/dashboard" : "/login"} />
          </Route>

          <Route>
            <div className="flex flex-col items-center justify-center h-full">
              <h1 className="text-4xl font-extrabold font-display">404</h1>
              <p className="text-muted-foreground mt-2">Page not found</p>
            </div>
          </Route>
        </Switch>
      </main>
    </div>
  );
}

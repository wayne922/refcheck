import React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  LogOut
} from "lucide-react";
import logo from "../assets/logo.png";

interface SidebarProps {
  user: { email: string; companyName: string };
  onLogout: () => void;
}

export function Sidebar({ user, onLogout }: SidebarProps) {
  const [location] = useLocation();

  const menuItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Candidates", href: "/candidates", icon: Users },
    { name: "Form Builder", href: "/builder", icon: Settings },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col justify-between h-screen sticky top-0">
      <div className="flex flex-col">
        {/* Logo / Branding Header */}
        <div className="p-6 border-b border-border flex items-center gap-3">
          <img src={logo} alt="RefCheck Logo" className="w-9 h-9 object-contain" />
          <div>
            <span className="font-bold font-display text-lg tracking-tight text-foreground">RefCheck</span>
            <span className="text-[10px] block font-semibold text-muted-foreground -mt-0.5 uppercase tracking-wider">Reference Vetting</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="p-4 space-y-1.5">
          {menuItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            
            return (
              <Link key={item.name} href={item.href}>
                <a className={`flex items-center gap-3.5 px-4 py-3 rounded-full text-sm font-semibold transition-all ${
                  isActive 
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" 
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}>
                  <Icon className={`w-5 h-5 ${isActive ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`} />
                  {item.name}
                </a>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Footer Profile & Action */}
      <div className="p-4 border-t border-border space-y-3">
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-9 h-9 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-sm">
            {user.companyName.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-none mb-1 text-foreground">{user.companyName}</p>
            <p className="text-xs text-muted-foreground truncate leading-none">{user.email}</p>
          </div>
        </div>
        
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 px-4 py-2.5 rounded-full text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

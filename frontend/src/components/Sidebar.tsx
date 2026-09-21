'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import { useChat } from '@/context/ChatContext';
import { useAuth } from '@/context/AuthContext';
import {
  MessageSquare,
  Folder,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  CalendarClock,
  Clock,
  Zap,
  Trash2,
} from 'lucide-react';

const navItems = [
  { key: 'nav-chat', href: '/', icon: MessageSquare, label: 'Chat', showCount: false },
  { key: 'nav-tasks', href: '/tasks', icon: Clock, label: 'Scheduled', showCount: false },
  { key: 'nav-history', href: '/chat-history-folders', icon: Folder, label: 'Folders & Projects', showCount: true },
  { key: 'nav-settings', href: '/settings', icon: Settings, label: 'Settings', showCount: false },
];

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [scheduledTasks, setScheduledTasks] = useState<any[]>([]);
  const pathname = usePathname();
  const { conversations, searchQuery, setSearchQuery, activeConversationId, loadConversation, deleteConversation, startNewChat, stopGeneration } =
    useChat();
  const { user, logout } = useAuth();

  useEffect(() => {
    const fetchScheduled = async () => {
      try {
        const { API_BASE, getAuthToken } = await import('@/lib/api');
        const token = getAuthToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${API_BASE}/api/scheduled-tasks`, { headers });
        if (res.ok) {
          const data = await res.json();
          setScheduledTasks(data.jobs || []);
        }
      } catch (err) {
        // ignore
      }
    };
    fetchScheduled();
  }, []);

  const handleLogout = () => {
    stopGeneration();
    logout();
  };

  return (
    <aside
      className={`sidebar-transition flex flex-col h-full bg-card border-r border-border shrink-0 relative z-20 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo / Brand */}
      <div className="flex items-center h-14 px-3 border-b border-border shrink-0">
        {!collapsed && (
          <Link
            href="/"
            className="flex items-center gap-2.5 flex-1 min-w-0 select-none py-0.5"
            onClick={() => {
              startNewChat();
              onNavigate?.();
            }}
          >
            <AppLogo size={30} variant="full" />
          </Link>
        )}
        {collapsed && (
          <div className="flex justify-center w-full">
            <AppLogo size={30} variant="shield" />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ${
            collapsed ? 'absolute -right-3 top-4 bg-card border border-border shadow-sm' : 'ml-1'
          }`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* New Chat Button */}
      <div className={`px-3 pt-3 pb-2 shrink-0 ${collapsed ? 'flex justify-center' : ''}`}>
        <Link
          href="/"
          onClick={() => {
            startNewChat();
            onNavigate?.();
          }}
          className={`flex items-center gap-2 gold-gradient-btn rounded-xl font-semibold text-sm transition-all hover:opacity-95 active:scale-95 shadow-sm ${
            collapsed ? 'w-10 h-10 justify-center p-0' : 'w-full px-3 py-2.5 justify-center'
          }`}
          title="New Chat"
        >
          <Plus size={16} />
          {!collapsed && <span>New Chat</span>}
        </Link>
      </div>

      {/* Search — only expanded */}
      {!collapsed && (
        <div className="px-3 pb-2 shrink-0">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations…"
              className="bg-transparent outline-none w-full text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
      )}

      {/* Nav Items */}
      <nav className="px-2 shrink-0">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => onNavigate?.()}
              className={`flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5 relative group ${
                active
                  ? 'bg-primary/10 text-primary' :'text-muted-foreground hover:bg-muted hover:text-foreground'
              } ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={17} strokeWidth={1.8} className="shrink-0" />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && item.showCount && !searchQuery && conversations.length > 0 && (
                <span className="text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-mono-data">
                  {conversations.length}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Recent Conversations & Scheduled Tasks — only expanded */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 mt-3 space-y-4">
          {/* Scheduled Tasks Section Bar */}
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <div className="flex items-center gap-1.5">
                <CalendarClock size={13} strokeWidth={1.8} className="text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Scheduled Tasks
                </span>
              </div>
              {scheduledTasks.length > 0 && (
                <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">
                  {scheduledTasks.length}
                </span>
              )}
            </div>
            {scheduledTasks.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground italic">No active background timers.</p>
            ) : (
              scheduledTasks.slice(0, 3).map((job) => (
                <Link
                  key={`side-job-${job.id}`}
                  href="/tasks"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/70 transition-colors text-xs text-foreground group mb-0.5"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                  <span className="truncate flex-1 font-medium">{job.prompt}</span>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {job.schedule || 'active'}
                  </span>
                </Link>
              ))
            )}
          </div>

          {/* Recent Conversations */}
          <div>
            <div className="flex items-center gap-1.5 px-2 mb-2">
              <Clock size={12} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {searchQuery ? 'Results' : 'Recent'}
              </span>
            </div>
            {conversations.length === 0 && (
              <p className="px-2 text-xs text-muted-foreground">
                {searchQuery ? 'No matching conversations.' : 'No conversations yet.'}
              </p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer group mb-0.5 ${
                  conv.id === activeConversationId ? 'bg-muted' : ''
                }`}
              >
                <Link
                  href="/"
                  onClick={() => {
                    loadConversation(conv.id);
                    onNavigate?.();
                  }}
                  className="flex-1 min-w-0"
                >
                  <span className="text-sm text-foreground leading-snug line-clamp-1 block">
                    {conv.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{relativeTime(conv.created_at)}</span>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity"
                  title="Delete chat"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        className={`px-2 py-3 border-t border-border shrink-0 flex items-center ${
          collapsed ? 'justify-center' : 'gap-2'
        }`}
      >
        {user?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external provider-hosted avatar, not worth a next.config remotePatterns entry for one small image
          <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
            <Zap size={13} className="text-primary-foreground" />
          </div>
        )}
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{user?.name || user?.email}</p>
            <button
              onClick={handleLogout}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

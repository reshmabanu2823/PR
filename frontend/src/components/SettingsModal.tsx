'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Settings as SettingsIcon,
  User,
  Brain,
  Sparkles,
  Plug,
  X,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  Check,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import SkillsSettings from '@/app/settings/components/SkillsSettings';
import McpSettings from '@/app/settings/components/McpSettings';
import MemorySettings from '@/app/settings/components/MemorySettings';

export interface SettingsModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  initialTab?: string;
  embedded?: boolean;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

// Only tabs that have real endpoints or meaningful persistent state
const NAV_GROUPS: NavGroup[] = [
  {
    group: 'General',
    items: [
      { id: 'preferences', label: 'Preferences', icon: SettingsIcon },
      { id: 'account', label: 'Account', icon: User },
    ],
  },
  {
    group: 'AI',
    items: [
      { id: 'memory', label: 'Memory', icon: Brain },
    ],
  },
  {
    group: 'Extend',
    items: [
      { id: 'skills', label: 'Skills', icon: Sparkles },
      { id: 'connectors', label: 'Connectors', icon: Plug },
    ],
  },
];

export default function SettingsModal({
  isOpen = true,
  onClose = () => {},
  initialTab = 'preferences',
  embedded = false,
}: SettingsModalProps) {
  const { user, logout } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');

  // Appearance states — persisted in localStorage
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('dark');
  const [chatFont, setChatFont] = useState('Geist Sans');
  const [fontOpen, setFontOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const savedPref = (localStorage.getItem('claudechat_theme_preference') ||
        localStorage.getItem('claudechat_theme') ||
        'dark') as 'system' | 'light' | 'dark';
      setTheme(savedPref);
      const savedFont = localStorage.getItem('pragna_chat_font');
      if (savedFont) setChatFont(savedFont);
    }
  }, []);

  const handleThemeChange = (newTheme: 'system' | 'light' | 'dark') => {
    setTheme(newTheme);
    let effective: 'dark' | 'light' = 'dark';
    if (newTheme === 'system') {
      effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } else {
      effective = newTheme;
    }
    if (effective === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('claudechat_theme', effective);
    localStorage.setItem('claudechat_theme_preference', newTheme);
  };

  const handleFontChange = (font: string) => {
    setChatFont(font);
    setFontOpen(false);
    localStorage.setItem('pragna_chat_font', font);
  };

  useEffect(() => {
    if (initialTab) {
      if (initialTab === 'mcp') setActiveTab('connectors');
      else setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !embedded) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, embedded]);

  const filteredNavGroups = useMemo(() => {
    if (!searchQuery.trim()) return NAV_GROUPS;
    const q = searchQuery.toLowerCase();
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLowerCase().includes(q)),
    })).filter((group) => group.items.length > 0);
  }, [searchQuery]);

  if (!isOpen && !embedded) return null;

  const modalBody = (
    <div
      className={
        embedded
          ? 'w-full h-full flex bg-background text-foreground overflow-hidden select-none'
          : 'relative w-[880px] max-w-[94vw] h-[620px] max-h-[90vh] rounded-2xl bg-background border border-border text-foreground shadow-2xl flex overflow-hidden select-none'
      }
      onClick={(e) => e.stopPropagation()}
    >
      {/* LEFT SIDEBAR */}
      <aside className="w-[200px] flex-shrink-0 bg-sidebar border-r border-border flex flex-col p-3">
        {/* Search */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-muted border border-transparent focus-within:border-primary/40 text-xs transition-colors mb-3">
          <Search size={13} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-xs"
          />
        </div>

        {/* Nav Groups */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
          {filteredNavGroups.map((group) => (
            <div key={group.group}>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-2 py-0.5 mb-1">
                {group.group}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-[13px] transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-primary/10 text-primary font-medium border border-primary/20'
                          : 'text-foreground/70 hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon
                        size={14}
                        className={`shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom: Pragna branding */}
        <div className="mt-3 pt-3 border-t border-border px-2">
          <p className="text-[10px] text-muted-foreground font-medium">Pragna</p>
          <p className="text-[10px] text-muted-foreground/60">by EtherX Innovations</p>
        </div>
      </aside>

      {/* RIGHT CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground">
            {NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeTab)?.label ?? 'Settings'}
          </h2>
          {!embedded && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 pb-8">
          {activeTab === 'preferences' && (
            <PreferencesPanel
              theme={theme}
              setTheme={handleThemeChange}
              chatFont={chatFont}
              setChatFont={handleFontChange}
              fontOpen={fontOpen}
              setFontOpen={setFontOpen}
            />
          )}

          {activeTab === 'account' && (
            <div className="space-y-5 max-w-md">
              <p className="text-xs text-muted-foreground">Manage your Pragna account details.</p>

              <div className="rounded-xl bg-card border border-border divide-y divide-border overflow-hidden">
                <div className="flex justify-between items-center px-4 py-3 text-[13px]">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-foreground font-medium">{user?.email ?? '—'}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 text-[13px]">
                  <span className="text-muted-foreground">Name</span>
                  <span className="text-foreground font-medium">{user?.name ?? '—'}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 text-[13px]">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="text-primary font-semibold">Pro</span>
                </div>
              </div>

              <button
                onClick={logout}
                className="px-4 py-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-medium transition-colors border border-destructive/20"
              >
                Log out
              </button>
            </div>
          )}

          {activeTab === 'memory' && <MemorySettings />}
          {activeTab === 'skills' && <SkillsSettings />}
          {activeTab === 'connectors' && <McpSettings />}
        </div>
      </main>
    </div>
  );

  if (embedded) return modalBody;
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      {modalBody}
    </div>,
    document.body
  );
}

/* ==========================================================================
   PREFERENCES PANEL — Only appearance (theme + font), both persisted locally
   ========================================================================== */
function PreferencesPanel({
  theme,
  setTheme,
  chatFont,
  setChatFont,
  fontOpen,
  setFontOpen,
}: {
  theme: 'system' | 'light' | 'dark';
  setTheme: (t: 'system' | 'light' | 'dark') => void;
  chatFont: string;
  setChatFont: (f: string) => void;
  fontOpen: boolean;
  setFontOpen: (v: boolean | ((p: boolean) => boolean)) => void;
}) {
  const fontOptions = ['Geist Sans', 'System Default', 'Geist Mono'];

  return (
    <div className="space-y-8 max-w-md">
      {/* APPEARANCE */}
      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Appearance
        </h3>
        <div className="space-y-5">
          {/* Theme */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-foreground font-medium">Theme</p>
              <p className="text-xs text-muted-foreground mt-0.5">Choose your preferred color scheme</p>
            </div>
            <div className="inline-flex items-center p-0.5 rounded-lg bg-muted border border-border">
              {(
                [
                  { value: 'system', Icon: Monitor, title: 'System' },
                  { value: 'light', Icon: Sun, title: 'Light' },
                  { value: 'dark', Icon: Moon, title: 'Dark' },
                ] as const
              ).map(({ value, Icon, title }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  title={title}
                  className={`p-1.5 rounded-md transition-all ${
                    theme === value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>

          {/* Chat Font */}
          <div className="flex items-center justify-between relative">
            <div>
              <p className="text-[13px] text-foreground font-medium">Chat font</p>
              <p className="text-xs text-muted-foreground mt-0.5">Font used in conversation messages</p>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setFontOpen((p) => !p)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-[13px] text-foreground hover:border-primary/40 transition-colors"
              >
                <span>{chatFont}</span>
                <ChevronDown size={13} className="text-muted-foreground" />
              </button>
              {fontOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-20 w-44 rounded-xl bg-card border border-border shadow-2xl p-1 text-xs">
                  {fontOptions.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setChatFont(f)}
                      className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                        chatFont === f
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <span>{f}</span>
                      {chatFont === f && <Check size={12} className="text-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

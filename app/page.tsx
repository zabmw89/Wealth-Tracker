/**
 * @file app/page.tsx
 * @description Primary client-side dashboard for the Wealth Portfolio Tracker.
 *
 * This is the application's only page-level React component. It runs exclusively on the client
 * ('use client') because it manages real-time UI state for chat streaming, modals, and theme switching.
 *
 * Architecture Overview:
 * ┌─ Data Fetching ──────────────────────────────────────────────────────────┐
 * │  All portfolio data is loaded from GET /api/portfolio on mount.           │
 * │  Holdings and allocation are computed server-side via domain services.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 * ┌─ UI Sections ────────────────────────────────────────────────────────────┐
 * │  1. Top Navigation    — logo, persona switcher (OWNER/EDITOR/VIEWER),     │
 * │                          theme toggle (light ↔ dark).                     │
 * │  2. Metrics Grid      — total net worth, cost basis, PnL, cash reserves.  │
 * │  3. Allocation Bar    — visual portfolio breakdown by asset class.         │
 * │  4. Holdings Table    — per-asset quantity, cost basis, market value, G/L. │
 * │  5. Ledger Table      — append-only transaction history.                   │
 * │  6. AI Assistant      — streaming chat with tool-call indicators and       │
 * │                          proposal confirmation cards.                       │
 * │  7. Record Tx Modal   — form to directly record a BUY/SELL/DEPOSIT/WITHDRAW│
 * └──────────────────────────────────────────────────────────────────────────┘
 * ┌─ Write Safety ───────────────────────────────────────────────────────────┐
 * │  Viewer role: "Record Transaction" button hidden; AI write tools omitted. │
 * │  Editor/Owner: proposals require explicit UI confirmation before commit.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { t, dir as localeDir, type Locale } from '@/lib/i18n';
import {
  Wallet,
  TrendingUp,
  Coins,
  Building,
  DollarSign,
  Plus,
  Send,
  Check,
  X,
  Shield,
  AlertTriangle,
  User,
  Sparkles,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  CheckCircle2,
  Lock,
  Layers,
  FileText,
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react';

interface PortfolioData {
  user: { id: string; name: string; email: string };
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  portfolio: { id: string; name: string; baseCurrency: string };
  assets: Array<{ id: string; symbol: string; name: string; type: string }>;
  holdings: Array<{
    assetId: string;
    symbol: string;
    name: string;
    type: string;
    quantity: string;
    costBasis: string;
    price: string;
    value: string;
  }>;
  allocation: {
    totalValue: string;
    totalCost: string;
    pnl: string;
    byType: Record<string, { value: string; pct: string }>;
  };
  transactions: Array<{
    id: string;
    assetId: string;
    assetSymbol: string;
    assetName: string;
    type: string;
    quantity: string;
    price: string;
    fee: string;
    date: string;
    createdBy: string;
    createdAt: string;
  }>;
  demoUsers: Array<{ id: string; name: string; email: string }>;
  asOf: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools?: Array<{ name: string; status: 'called' | 'done' }>;
  proposal?: {
    assetId: string;
    assetSymbol: string;
    type: string;
    quantity: string;
    price: string;
    fee: string;
    date: string;
    status: 'pending' | 'confirmed' | 'cancelled';
  };
}

export default function Home() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Theme state: light mode is the default
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Locale / language state — persisted to localStorage
  const [locale, setLocale] = useState<Locale>('en');

  // Shorthand accessor — re-evaluated on every render when locale changes
  const tr = t(locale);

  useEffect(() => {
    const savedTheme = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Restore persisted locale on mount
    const savedLocale = (localStorage.getItem('locale') as Locale) || 'en';
    setLocale(savedLocale);
    document.documentElement.setAttribute('lang', savedLocale);
    document.documentElement.setAttribute('dir', localeDir[savedLocale]);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  /** Toggle between English (LTR) and Arabic (RTL). */
  const toggleLocale = () => {
    const nextLocale: Locale = locale === 'en' ? 'ar' : 'en';
    setLocale(nextLocale);
    document.documentElement.setAttribute('lang', nextLocale);
    document.documentElement.setAttribute('dir', localeDir[nextLocale]);
    localStorage.setItem('locale', nextLocale);
    // Update the AI assistant welcome message to match the new locale
    setMessages((prev) =>
      prev.map((m) =>
        m.id === 'init' ? { ...m, content: t(nextLocale).initMessage } : m
      )
    );
  };

  // Transaction Modal State
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txSubmitting, setTxSubmitting] = useState(false);
  const [txForm, setTxForm] = useState({
    assetId: '',
    type: 'BUY',
    quantity: '1',
    price: '100',
    fee: '0',
    date: new Date().toISOString().split('T')[0],
  });

  // Chat State — initial message uses current locale
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'assistant',
      content:
        'Hello! I am your portfolio assistant. I can summarize your portfolio, analyze holdings and asset allocation, compute rebalancing targets, and prepare transaction proposals for your review.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchPortfolio = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/portfolio');
      if (!res.ok) {
        throw new Error(`Failed to load portfolio (${res.status})`);
      }
      const json: PortfolioData = await res.json();
      setData(json);
      if (json.assets.length > 0 && !txForm.assetId) {
        setTxForm((prev) => ({ ...prev, assetId: json.assets[0].id }));
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching portfolio');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  // Switch demo persona
  const handleSwitchUser = async (email: string) => {
    try {
      const res = await fetch(`/api/dev-login?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        setActionAlert({ type: 'success', message: `${tr.switchedUser} ${email}` });
        await fetchPortfolio();
      }
    } catch (err: any) {
      setActionAlert({ type: 'error', message: tr.failedSwitch });
    }
  };

  // Refresh market prices
  const handleRefreshPrices = async () => {
    try {
      setRefreshingPrices(true);
      const res = await fetch('/api/prices/refresh', { method: 'POST' });
      if (res.ok) {
        setActionAlert({ type: 'success', message: tr.pricesRefreshed });
        await fetchPortfolio();
      }
    } catch (err: any) {
      setActionAlert({ type: 'error', message: tr.failedRefresh });
    } finally {
      setRefreshingPrices(false);
    }
  };

  // Direct Transaction Form Submit
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setTxSubmitting(true);
    setActionAlert(null);

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId: data.portfolio.id,
          assetId: txForm.assetId,
          type: txForm.type,
          quantity: txForm.quantity,
          price: txForm.price,
          fee: txForm.fee,
          date: new Date(txForm.date).toISOString(),
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'Transaction failed');
      }

      setActionAlert({
        type: 'success',
        message: `${tr.txSuccess} ${txForm.type} ${txForm.quantity} units.`,
      });
      setIsTxModalOpen(false);
      await fetchPortfolio();
    } catch (err: any) {
      setActionAlert({ type: 'error', message: err.message || tr.txFailed });
    } finally {
      setTxSubmitting(false);
    }
  };

  // Confirm an AI Transaction Proposal
  const handleConfirmProposal = async (proposal: NonNullable<ChatMessage['proposal']>, msgId: string) => {
    if (!data) return;
    try {
      const res = await fetch('/api/agent/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId: data.portfolio.id,
          assetId: proposal.assetId,
          type: proposal.type,
          quantity: proposal.quantity,
          price: proposal.price,
          fee: proposal.fee,
          date: proposal.date,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'Failed to confirm transaction proposal');
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.proposal
            ? { ...m, proposal: { ...m.proposal, status: 'confirmed' } }
            : m
        )
      );

      setActionAlert({
        type: 'success',
        message: `${tr.confirmSuccess} ${proposal.type} ${proposal.quantity} ${proposal.assetSymbol}.`,
      });
      await fetchPortfolio();
    } catch (err: any) {
      setActionAlert({ type: 'error', message: err.message || tr.confirmFailed });
    }
  };

  // Cancel an AI Transaction Proposal
  const handleCancelProposal = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.proposal
          ? { ...m, proposal: { ...m.proposal, status: 'cancelled' } }
          : m
      )
    );
    setActionAlert({ type: 'success', message: tr.proposalCancelled });
  };

  // Submit Chat Prompt
  const handleSendChat = async (userText: string) => {
    const text = userText.trim();
    if (!text || !data || chatLoading) return;

    const userMessage: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    const assistantMsgId = `a_${Date.now()}`;
    const newAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      tools: [],
    };
    setMessages((prev) => [...prev, newAssistantMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId: data.portfolio.id,
          messages: [...messages, userMessage].map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Chat error (${res.status}): ${errText}`);
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
      let currentProposal: ChatMessage['proposal'] | undefined;
      const toolsInvoked: Array<{ name: string; status: 'called' | 'done' }> = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;

          try {
            const chunk = JSON.parse(raw);

            if (chunk.type === 'text-delta') {
              accumulatedText += chunk.delta;
            } else if (chunk.type === 'tool-input-available') {
              toolsInvoked.push({ name: chunk.toolName, status: 'called' });
              if (chunk.toolName === 'proposeTransaction') {
                const inp = chunk.input;
                currentProposal = {
                  assetId: inp.assetId,
                  assetSymbol: inp.assetSymbol || 'AAPL',
                  type: inp.type,
                  quantity: inp.quantity,
                  price: inp.price,
                  fee: inp.fee || '0',
                  date: inp.date,
                  status: 'pending',
                };
              }
            } else if (chunk.type === 'tool-output-available') {
              const lastTool = toolsInvoked[toolsInvoked.length - 1];
              if (lastTool) lastTool.status = 'done';

              if (chunk.output?.proposal) {
                currentProposal = {
                  ...chunk.output.proposal,
                  status: 'pending',
                };
              }
            }

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: accumulatedText,
                      tools: [...toolsInvoked],
                      proposal: currentProposal,
                    }
                  : m
              )
            );
          } catch {
            // Non-JSON or chunk fragment, continue
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: `⚠️ Error communicating with assistant: ${err.message || 'Unknown error'}`,
              }
            : m
        )
      );
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw className="animate-spin" size={36} color="var(--accent-primary)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{tr.loadingTitle}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{tr.loadingDesc}</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-container">
        <div className="alert-banner alert-error" style={{ margin: '40px auto', maxWidth: '600px' }}>
          <AlertTriangle size={24} />
          <div>
            <strong>{tr.errorTitle}</strong>
            <p>{error || tr.errorNoData}</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchPortfolio}>{tr.retry}</button>
        </div>
      </div>
    );
  }

  const isViewer = data.role === 'VIEWER';
  const pnlNum = Number(data.allocation.pnl);
  const totalCostNum = Number(data.allocation.totalCost);
  const pnlPct = totalCostNum > 0 ? ((pnlNum / totalCostNum) * 100).toFixed(2) : '0.00';
  const cashHolding = data.holdings.find((h) => h.type === 'CASH');

  return (
    <div className="app-container">
      {/* Top Header & Role Switcher */}
      <header className="top-nav">
        <div className="logo-area">
          <div className="logo-icon">
            <Wallet size={22} />
          </div>
          <div>
            <h1 className="logo-title">{tr.appTitle}</h1>
            <span className="logo-subtitle">{tr.appSubtitle}</span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="header-actions">
          {/* Persona Switcher Bar */}
          <div className="user-bar">
            <span className="role-switcher-title">{tr.switchPersona}</span>
            {data.demoUsers.map((u) => {
              const role = u.email.includes('alice') ? 'OWNER' : u.email.includes('bob') ? 'EDITOR' : 'VIEWER';
              const isActive = u.id === data.user.id;
              return (
                <button
                  key={u.id}
                  className={`user-pill-btn ${isActive ? 'active' : ''}`}
                  onClick={() => handleSwitchUser(u.email)}
                >
                  <User size={13} />
                  <span>{u.name}</span>
                  <span className={`badge badge-${role.toLowerCase()}`}>{role}</span>
                </button>
              );
            })}
          </div>

          {/* Language Toggle Button */}
          <button
            className="lang-toggle-btn"
            onClick={toggleLocale}
            title={tr.switchLang}
            aria-label="Toggle language"
          >
            {tr.switchLang}
          </button>

          {/* Theme Toggle Button */}
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'light' ? tr.switchToDark : tr.switchToLight}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} color="#00fa9a" />}
          </button>
        </div>
      </header>

      {/* Action Toast Alert */}
      {actionAlert && (
        <div className={`alert-banner alert-${actionAlert.type}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {actionAlert.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{actionAlert.message}</span>
          </div>
          <button
            onClick={() => setActionAlert(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Demo Notice Banner */}
      <div className="demo-banner">
        <div className="demo-banner-left">
          <Shield size={16} color="var(--accent-primary)" />
          <span>
            <strong>{tr.demoBannerText}</strong> {tr.demoBannerDesc}
          </span>
        </div>
        <div className="demo-banner-right">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
            {tr.pricesAsOf} {new Date(data.asOf).toLocaleTimeString()}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRefreshPrices}
            disabled={refreshingPrices}
          >
            <RefreshCw size={12} className={refreshingPrices ? 'animate-spin' : ''} />
            <span>{refreshingPrices ? tr.updating : tr.refreshPrices}</span>
          </button>
        </div>
      </div>

      {/* Financial Metrics Overview */}
      <section className="metrics-grid">
        <div className="glass-card metric-card">
          <div className="metric-header">
            <span>{tr.totalNetWorth}</span>
            <Wallet size={16} color="var(--accent-primary)" />
          </div>
          <div className="metric-value">
            ${Number(data.allocation.totalValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="metric-footer" style={{ color: 'var(--text-secondary)' }}>
            <span>{tr.baseCurrency} {data.portfolio.baseCurrency}</span>
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-header">
            <span>{tr.totalCostBasis}</span>
            <DollarSign size={16} color="#94a3b8" />
          </div>
          <div className="metric-value">
            ${Number(data.allocation.totalCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="metric-footer" style={{ color: 'var(--text-muted)' }}>
            <span>{tr.cumulativeCapital}</span>
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-header">
            <span>{tr.unrealizedGainLoss}</span>
            <TrendingUp size={16} color={pnlNum >= 0 ? 'var(--success)' : 'var(--danger)'} />
          </div>
          <div className={`metric-value ${pnlNum >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
            {pnlNum >= 0 ? '+' : ''}${pnlNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="metric-footer">
            <span className={pnlNum >= 0 ? 'pnl-positive' : 'pnl-negative'} style={{ fontWeight: 600 }}>
              {pnlNum >= 0 ? '+' : ''}{pnlPct}%
            </span>
            <span style={{ color: 'var(--text-muted)' }}>{tr.returnOnCapital}</span>
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-header">
            <span>{tr.liquidCash}</span>
            <Coins size={16} color="#f59e0b" />
          </div>
          <div className="metric-value">
            ${cashHolding ? Number(cashHolding.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
          </div>
          <div className="metric-footer" style={{ color: 'var(--text-muted)' }}>
            <span>{tr.availableForDeployment}</span>
          </div>
        </div>
      </section>

      {/* Asset Allocation Section */}
      <section className="glass-card" style={{ marginBottom: '24px' }}>
        <div className="section-header" style={{ marginBottom: '8px' }}>
          <h2 className="section-title">
            <Layers size={18} color="var(--accent-primary)" />
            <span>{tr.assetAllocation}</span>
          </h2>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{tr.categorizedByClass}</span>
        </div>

        {/* Visual Allocation Bar */}
        <div className="allocation-bar-container">
          <div
            className="allocation-segment segment-stock"
            style={{ width: `${data.allocation.byType.STOCK?.pct || 0}%` }}
            title={`Stocks: ${data.allocation.byType.STOCK?.pct || 0}%`}
          />
          <div
            className="allocation-segment segment-crypto"
            style={{ width: `${data.allocation.byType.CRYPTO?.pct || 0}%` }}
            title={`Crypto: ${data.allocation.byType.CRYPTO?.pct || 0}%`}
          />
          <div
            className="allocation-segment segment-realestate"
            style={{ width: `${data.allocation.byType.REAL_ESTATE?.pct || 0}%` }}
            title={`Real Estate: ${data.allocation.byType.REAL_ESTATE?.pct || 0}%`}
          />
          <div
            className="allocation-segment segment-cash"
            style={{ width: `${data.allocation.byType.CASH?.pct || 0}%` }}
            title={`Cash: ${data.allocation.byType.CASH?.pct || 0}%`}
          />
        </div>

        {/* Legend */}
        <div className="allocation-legend">
          <div className="legend-item">
            <div className="legend-color-dot segment-stock" />
            <div className="legend-info">
              <span className="legend-label">{tr.stocks}</span>
              <span className="legend-value">${Number(data.allocation.byType.STOCK?.value || 0).toLocaleString()} ({data.allocation.byType.STOCK?.pct || '0'}%)</span>
            </div>
          </div>
          <div className="legend-item">
            <div className="legend-color-dot segment-crypto" />
            <div className="legend-info">
              <span className="legend-label">{tr.crypto}</span>
              <span className="legend-value">${Number(data.allocation.byType.CRYPTO?.value || 0).toLocaleString()} ({data.allocation.byType.CRYPTO?.pct || '0'}%)</span>
            </div>
          </div>
          <div className="legend-item">
            <div className="legend-color-dot segment-realestate" />
            <div className="legend-info">
              <span className="legend-label">{tr.realEstate}</span>
              <span className="legend-value">${Number(data.allocation.byType.REAL_ESTATE?.value || 0).toLocaleString()} ({data.allocation.byType.REAL_ESTATE?.pct || '0'}%)</span>
            </div>
          </div>
          <div className="legend-item">
            <div className="legend-color-dot segment-cash" />
            <div className="legend-info">
              <span className="legend-label">{tr.cash}</span>
              <span className="legend-value">${Number(data.allocation.byType.CASH?.value || 0).toLocaleString()} ({data.allocation.byType.CASH?.pct || '0'}%)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Two-Column Layout */}
      <div className="dashboard-grid">
        {/* Left Column: Holdings & Transactions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Current Holdings Table */}
          <div className="glass-card">
            <div className="section-header">
              <h2 className="section-title">
                <Coins size={18} color="var(--accent-primary)" />
                <span>{tr.holdingsProjection}</span>
              </h2>

              {isViewer ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <Lock size={14} color="#93c5fd" />
                  <span>{tr.viewerMode}</span>
                </div>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => setIsTxModalOpen(true)}>
                  <Plus size={14} />
                  <span>{tr.recordTransaction}</span>
                </button>
              )}
            </div>

            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>{tr.asset}</th>
                    <th>{tr.class}</th>
                    <th style={{ textAlign: 'right' }}>{tr.quantity}</th>
                    <th style={{ textAlign: 'right' }}>{tr.costBasis}</th>
                    <th style={{ textAlign: 'right' }}>{tr.marketPrice}</th>
                    <th style={{ textAlign: 'right' }}>{tr.marketValue}</th>
                    <th style={{ textAlign: 'right' }}>{tr.gainLoss}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.holdings.map((h) => {
                    const gain = Number(h.value) - Number(h.costBasis);
                    const gainPct = Number(h.costBasis) > 0 ? ((gain / Number(h.costBasis)) * 100).toFixed(2) : '0.00';
                    return (
                      <tr key={h.assetId}>
                        <td>
                          <div className="asset-cell">
                            <span className="asset-symbol">{h.symbol}</span>
                            <span className="asset-name">{h.name}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge badge-${h.type.toLowerCase().replace('_', '')}`}>
                            {h.type}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono-cell">{h.quantity}</td>
                        <td style={{ textAlign: 'right' }} className="mono-cell">${Number(h.costBasis).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right' }} className="mono-cell">${Number(h.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right' }} className="mono-cell">${Number(h.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right' }} className="mono-cell">
                          {h.type === 'CASH' ? (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          ) : (
                            <span className={gain >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                              {gain >= 0 ? '+' : ''}${gain.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({gainPct}%)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Transactions Ledger */}
          <div className="glass-card">
            <div className="section-header">
              <h2 className="section-title">
                <FileText size={18} color="var(--accent-primary)" />
                <span>{tr.appendOnlyLedger}</span>
              </h2>
              <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                {tr.immutableLedger} ({data.transactions.length})
              </span>
            </div>

            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>{tr.date}</th>
                    <th>{tr.type}</th>
                    <th>{tr.asset}</th>
                    <th style={{ textAlign: 'right' }}>{tr.quantity}</th>
                    <th style={{ textAlign: 'right' }}>{tr.unitPrice}</th>
                    <th style={{ textAlign: 'right' }}>{tr.fee}</th>
                    <th style={{ textAlign: 'right' }}>{tr.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((tx) => {
                    const isPositive = tx.type === 'BUY' || tx.type === 'DEPOSIT';
                    const total = Number(tx.quantity) * Number(tx.price) + Number(tx.fee);
                    return (
                      <tr key={tx.id}>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                          {new Date(tx.date).toLocaleDateString()}
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: isPositive ? '#6ee7b7' : '#fca5a5',
                              border: `1px solid ${isPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            }}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="mono-cell" style={{ fontWeight: 600 }}>{tx.assetSymbol}</td>
                        <td style={{ textAlign: 'right' }} className="mono-cell">{tx.quantity}</td>
                        <td style={{ textAlign: 'right' }} className="mono-cell">${Number(tx.price).toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }} className="mono-cell">${Number(tx.fee).toLocaleString()}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }} className="mono-cell">
                          ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: AI Assistant Panel */}
        <aside className="glass-card assistant-card">
          <div className="assistant-header">
            <div className="assistant-title-group">
              <div className="assistant-pulse-dot" />
              <div>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {tr.aiAssistant}
                </h3>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  {tr.boundBy} <strong>{data.role}</strong> {tr.policies}
                </span>
              </div>
            </div>
            <span className={`badge badge-${data.role.toLowerCase()}`}>{data.role}</span>
          </div>

          {/* Messages Container */}
          <div className="assistant-messages">
            {messages.map((m) => (
              <div key={m.id} className={`message-bubble message-${m.role}`}>
                {/* Tool calls indicators */}
                {m.tools && m.tools.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                    {m.tools.map((t, idx) => (
                      <span key={idx} className="tool-indicator">
                        <Sparkles size={11} />
                        <span>tool: {t.name}</span>
                        {t.status === 'done' && <Check size={11} color="#34d399" />}
                      </span>
                    ))}
                  </div>
                )}

                {/* Message Text with simple line breaks */}
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>

                {/* Proposal Confirmation Card */}
                {m.proposal && (
                  <div className="proposal-box">
                    <div className="proposal-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={14} color="#fbbf24" />
                        <span>{tr.pendingProposal}</span>
                      </div>
                      <span className="badge" style={{ background: '#f59e0b', color: '#000' }}>
                        {tr.requiresApproval}
                      </span>
                    </div>

                    <div className="proposal-details">
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>{tr.proposalAsset}</span>
                        <div>{m.proposal.assetSymbol}</div>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>{tr.proposalAction}</span>
                        <div>{m.proposal.type}</div>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>{tr.proposalQuantity}</span>
                        <div>{m.proposal.quantity}</div>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>{tr.proposalUnitPrice}</span>
                        <div>${Number(m.proposal.price).toLocaleString()}</div>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>{tr.proposalTotal}</span>
                        <div>${(Number(m.proposal.quantity) * Number(m.proposal.price)).toLocaleString()}</div>
                      </div>
                    </div>

                    {m.proposal.status === 'pending' ? (
                      <div className="proposal-actions">
                        <button
                          className="btn btn-success btn-sm"
                          style={{ flex: 1 }}
                          onClick={() => handleConfirmProposal(m.proposal!, m.id)}
                        >
                          <Check size={14} />
                          <span>{tr.confirmTransaction}</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleCancelProposal(m.id)}
                        >
                          <X size={14} />
                          <span>{tr.cancel}</span>
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: m.proposal.status === 'confirmed' ? '#34d399' : '#f87171' }}>
                        {m.proposal.status === 'confirmed' ? tr.confirmed : tr.discarded}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {chatLoading && (
              <div className="message-bubble message-assistant" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RefreshCw size={14} className="animate-spin" />
                <span>{tr.thinking}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompt Chips — labels are translated; prompts sent to AI stay in English */}
          <div className="prompt-chips">
            <button className="chip-btn" onClick={() => handleSendChat(tr.chipSummaryPrompt)}>
              {tr.chipSummary}
            </button>
            <button className="chip-btn" onClick={() => handleSendChat(tr.chipHoldingsPrompt)}>
              {tr.chipHoldings}
            </button>
            <button className="chip-btn" onClick={() => handleSendChat(tr.chipRebalancePrompt)}>
              {tr.chipRebalance}
            </button>
            {!isViewer && (
              <button className="chip-btn" onClick={() => handleSendChat(tr.chipProposePrompt)}>
                {tr.chipPropose}
              </button>
            )}
          </div>

          {/* Chat Input */}
          <div className="assistant-input-area">
            <form
              className="assistant-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat(chatInput);
              }}
            >
              <input
                type="text"
                className="chat-input"
                placeholder={isViewer ? tr.askReadOnly : tr.askWritable}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={chatLoading}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={chatLoading || !chatInput.trim()}>
                <Send size={14} />
              </button>
            </form>
          </div>
        </aside>
      </div>

      {/* Record Transaction Modal */}
      {isTxModalOpen && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{tr.recordTxTitle}</h3>
              </div>
              <button
                onClick={() => setIsTxModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTransaction}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">{tr.txAsset}</label>
                  <select
                    className="form-select"
                    value={txForm.assetId}
                    onChange={(e) => setTxForm({ ...txForm, assetId: e.target.value })}
                    required
                  >
                    {data.assets.map((a) => (
                      <option key={a.id} value={a.id} className="select-option">
                        {a.symbol} — {a.name} ({a.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{tr.txType}</label>
                  <select
                    className="form-select"
                    value={txForm.type}
                    onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}
                  >
                    <option value="BUY" className="select-option">BUY</option>
                    <option value="SELL" className="select-option">SELL</option>
                    <option value="DEPOSIT" className="select-option">DEPOSIT</option>
                    <option value="WITHDRAW" className="select-option">WITHDRAW</option>
                  </select>
                </div>

                <div className="transaction-fields">
                  <div className="form-group">
                    <label className="form-label">{tr.txQuantity}</label>
                    <input
                      type="number"
                      step="any"
                      min="0.00000001"
                      className="form-input"
                      value={txForm.quantity}
                      onChange={(e) => setTxForm({ ...txForm, quantity: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">{tr.txUnitPrice}</label>
                    <input
                      type="number"
                      step="any"
                      min="0.00000001"
                      className="form-input"
                      value={txForm.price}
                      onChange={(e) => setTxForm({ ...txForm, price: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="transaction-fields">
                  <div className="form-group">
                    <label className="form-label">{tr.txFee}</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="form-input"
                      value={txForm.fee}
                      onChange={(e) => setTxForm({ ...txForm, fee: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">{tr.txDate}</label>
                    <input
                      type="date"
                      className="form-input"
                      value={txForm.date}
                      onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsTxModalOpen(false)}
                >
                  {tr.txCancel}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={txSubmitting}
                >
                  {txSubmitting ? tr.txRecording : tr.txCommit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

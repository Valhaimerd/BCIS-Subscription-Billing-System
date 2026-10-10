import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Database,
  FileText,
  House,
  Lock,
  LogOut,
  Map,
  Menu,
  Package,
  Radio,
  Users,
  WalletCards,
  Wifi,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { DesktopSession } from '../../shared/desktop-api';
import { BillingView } from './BillingViews';
import { CollectionsView } from './CollectionsView';
import { PaymentsView } from './PaymentViews';
import { ReceivablesView } from './ReceivablesView';
import { ReportsView } from './ReportingViews';
import { PlansView, SubscribersView } from './MasterDataViews';
import { OperationsView } from './OperationsView';
import { DashboardView } from './DashboardView';
import { SubscriberQuickSearch } from './SubscriberQuickSearch';
import { visibleNavigation, type AppViewId } from './navigation';

const SIDEBAR_STORAGE_KEY = 'bcis.sidebar.collapsed';

const viewIcons = {
  Home: House,
  Subscribers: Users,
  Plans: Package,
  Billing: FileText,
  Payments: WalletCards,
  Collections: Map,
  Receivables: CreditCard,
  Services: Radio,
  Reports: BarChart3,
  'Backup & recovery': Database,
};

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';

export function App(): React.JSX.Element {
  const [session, setSession] = useState<DesktopSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!window.bcis) return setLoading(false);
    void window.bcis.auth
      .current()
      .then(setSession)
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div className="auth-status">Loading secure session…</div>;
  if (!session) return <LoginScreen onAuthenticated={setSession} />;
  if (session.locked)
    return <LockScreen session={session} onChange={setSession} />;
  return <AuthenticatedShell session={session} onChange={setSession} />;
}

function LoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (session: DesktopSession) => void;
}) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      setSubmitting(true);
      if (!window.bcis)
        throw new Error('Open the installed desktop application to sign in.');
      onAuthenticated(
        await window.bcis.auth.login({
          username: String(form.get('username')),
          password: String(form.get('password')),
        }),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-layout">
      <section className="login-context" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark">BC</span>
          <span>
            <strong>BCIS</strong>
            <small>Billing &amp; Collection</small>
          </span>
        </div>
        <div className="login-story">
          <p className="login-kicker">Operations, in sync</p>
          <h1 id="login-title">
            Every connection.
            <br />
            Every payment.
            <br />
            <span>In good order.</span>
          </h1>
          <p className="login-copy">
            One secure workspace for subscriber accounts, billing, payments, and
            collection work.
          </p>
          <div className="login-visual" aria-hidden="true">
            <svg viewBox="0 0 460 136" fill="none">
              <path
                className="chart-grid"
                d="M1 27.5h458M1 67.5h458M1 107.5h458"
              />
              <path
                className="chart-area"
                d="M1 104c44 0 45-47 91-47s43 27 88 27 43-42 89-42 43 26 88 26 43-37 103-37v104H1z"
              />
              <path
                className="chart-line"
                d="M1 104c44 0 45-47 91-47s43 27 88 27 43-42 89-42 43 26 88 26 43-37 103-37"
              />
              <circle className="chart-point" cx="358" cy="68" r="4" />
              <circle
                className="chart-point chart-point-last"
                cx="459"
                cy="31"
                r="5"
              />
            </svg>
            <div className="chart-caption">
              <span>Subscriber operations</span>
              <span className="chart-state">
                <i /> In good order
              </span>
            </div>
          </div>
        </div>
        <div className="login-boundary">
          <Lock aria-hidden="true" size={18} />
          <span>Session tokens remain inside the Electron main process.</span>
        </div>
      </section>
      <section className="login-panel" aria-labelledby="sign-in-heading">
        <form onSubmit={submit}>
          <span className="login-eyebrow">Staff portal</span>
          <h2 id="sign-in-heading">Sign in to BCIS</h2>
          <p>Use the account assigned by your system administrator.</p>
          <label>
            Username
            <input
              autoComplete="username"
              name="username"
              placeholder="Enter your username"
              required
            />
          </label>
          <label>
            Password
            <span className="password-field">
              <input
                autoComplete="current-password"
                minLength={8}
                name="password"
                placeholder="Enter your password"
                required
                type={showPassword ? 'text' : 'password'}
              />
              <button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="password-visibility"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" size={18} />
                ) : (
                  <Eye aria-hidden="true" size={18} />
                )}
              </button>
            </span>
          </label>
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
          <button
            className="primary-action"
            disabled={submitting}
            type="submit"
          >
            <span>{submitting ? 'Signing in…' : 'Sign in'}</span>
          </button>
          <div className="login-form-foot">
            <Lock aria-hidden="true" size={14} />
            <span>Your session is encrypted and protected.</span>
          </div>
        </form>
      </section>
    </main>
  );
}

function LockScreen({
  session,
  onChange,
}: {
  session: DesktopSession;
  onChange: (session: DesktopSession | null) => void;
}) {
  const [error, setError] = useState('');
  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      if (!window.bcis) throw new Error('Desktop bridge unavailable.');
      onChange(
        await window.bcis.auth.unlock(
          String(new FormData(event.currentTarget).get('password')),
        ),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }
  return (
    <main className="lock-layout">
      <form className="lock-card" onSubmit={unlock}>
        <Lock aria-hidden="true" size={26} />
        <span className="eyebrow">Session locked</span>
        <h1>{session.user.fullName}</h1>
        <p>Enter your password to return to BCIS.</p>
        <label>
          Password
          <input autoFocus name="password" required type="password" />
        </label>
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}
        <button className="primary-action" type="submit">
          Unlock
        </button>
        <button
          className="text-action"
          onClick={() =>
            void window.bcis?.auth.logout().then(() => onChange(null))
          }
          type="button"
        >
          Sign out instead
        </button>
      </form>
    </main>
  );
}

function AuthenticatedShell({
  session,
  onChange,
}: {
  session: DesktopSession;
  onChange: (session: DesktopSession | null) => void;
}) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] =
    useState(readSidebarCollapsed);
  const [activeView, setActiveView] = useState<AppViewId>('Home');
  const [initialSubscriberId, setInitialSubscriberId] = useState<string>();
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeNavigationButtonRef = useRef<HTMLButtonElement>(null);
  const wasNavigationOpen = useRef(false);
  useEffect(() => {
    if (!navigator.userAgent.includes('jsdom')) window.scrollTo({ top: 0 });
  }, [activeView]);
  const navigationGroups = visibleNavigation(session.user.permissions);
  const initials = session.user.fullName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // Sidebar state remains usable if the host disables local storage.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!navigationOpen) {
      if (wasNavigationOpen.current) menuButtonRef.current?.focus();
      wasNavigationOpen.current = false;
      return;
    }

    wasNavigationOpen.current = true;
    closeNavigationButtonRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setNavigationOpen(false);
        return;
      }
      if (event.key === 'Tab' && sidebarRef.current) {
        const focusable = Array.from(
          sidebarRef.current.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
          ),
        ).filter(
          (button) =>
            !button.closest('[hidden]') &&
            window.getComputedStyle(button).display !== 'none',
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigationOpen]);

  function selectNavigation(id: AppViewId) {
    setActiveView(id);
    setNavigationOpen(false);
  }

  return (
    <div className={`app-frame${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside
        className={`sidebar${navigationOpen ? ' sidebar-open' : ''}`}
        aria-label="Application sidebar"
        aria-modal={navigationOpen ? true : undefined}
        ref={sidebarRef}
        role={navigationOpen ? 'dialog' : undefined}
      >
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            BC
          </span>
          <div className="brand-copy">
            <strong>BCIS</strong>
            <span>Billing & Collection</span>
          </div>
          {navigationOpen ? (
            <button
              aria-label="Close navigation"
              className="mobile-nav-close"
              onClick={() => setNavigationOpen(false)}
              ref={closeNavigationButtonRef}
              type="button"
            >
              <ChevronLeft aria-hidden="true" size={18} />
            </button>
          ) : null}
          <button
            aria-label={
              sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
            }
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            type="button"
          >
            {sidebarCollapsed ? (
              <ChevronRight aria-hidden="true" size={18} />
            ) : (
              <ChevronLeft aria-hidden="true" size={18} />
            )}
          </button>
        </div>
        <nav aria-label="Primary navigation">
          {navigationGroups.map(({ label, items }) => (
            <section className="nav-group" key={label}>
              {label !== 'Today' ? (
                <p className="nav-group-label">{label}</p>
              ) : null}
              <div className="nav-group-items">
                {items.map(({ id, label: itemLabel }) => {
                  const Icon = viewIcons[id];
                  return (
                    <button
                      aria-current={id === activeView ? 'page' : undefined}
                      aria-label={sidebarCollapsed ? itemLabel : undefined}
                      className="nav-item"
                      key={id}
                      onClick={() => selectNavigation(id)}
                      title={sidebarCollapsed ? itemLabel : undefined}
                      type="button"
                    >
                      <Icon aria-hidden="true" size={18} />
                      <span className="nav-item-label">{itemLabel}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        <div className="system-strip">
          <Wifi aria-hidden="true" size={17} />
          <div>
            <strong>Protected session</strong>
            <span>API authorization enforced</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            aria-expanded={navigationOpen}
            aria-label={
              navigationOpen ? 'Close navigation menu' : 'Open navigation menu'
            }
            className="menu-button"
            onClick={() => setNavigationOpen((open) => !open)}
            ref={menuButtonRef}
            type="button"
          >
            {navigationOpen ? (
              <ChevronLeft aria-hidden="true" size={20} />
            ) : (
              <Menu aria-hidden="true" size={20} />
            )}
          </button>
          <SubscriberQuickSearch
            canSearch={session.user.permissions.includes('subscriber.view')}
            onSelect={(subscriberId) => {
              setInitialSubscriberId(subscriberId);
              setActiveView('Subscribers');
            }}
          />
          <div className="session-actions">
            <button
              aria-label="Lock session"
              onClick={() => void window.bcis?.auth.lock().then(onChange)}
              type="button"
            >
              <Lock aria-hidden="true" size={17} />
            </button>
            <button
              aria-label="Sign out"
              onClick={() =>
                void window.bcis?.auth.logout().then(() => onChange(null))
              }
              type="button"
            >
              <LogOut aria-hidden="true" size={17} />
            </button>
          </div>
          <div className="user-placeholder" aria-label="Authentication status">
            <span aria-hidden="true">{initials}</span>
            <div>
              <strong>{session.user.fullName}</strong>
              <small>{session.user.roles.join(', ')}</small>
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <header className="page-heading">
            <div>
              <p>{activeView === 'Home' ? 'Your workspace' : 'Workspace'}</p>
              <h1>{activeView === 'Home' ? 'Today' : activeView}</h1>
              <span>
                {activeView === 'Home'
                  ? 'Your permitted billing and collection work begins here.'
                  : activeView === 'Subscribers' || activeView === 'Services'
                    ? 'Search master records, open complete profiles, and manage connected services.'
                    : activeView === 'Plans'
                      ? 'Maintain Internet, Cable, and Combo offerings without rewriting existing account rates.'
                      : activeView === 'Billing'
                        ? 'Generate monthly charges, review finalized invoices, and open printable invoice details.'
                        : activeView === 'Payments'
                          ? 'Receive, verify, trace, and reverse subscriber payments with accountable receipts.'
                          : activeView === 'Collections'
                            ? 'Issue frozen route sheets, post collections, and reconcile Cash remittances with visible differences.'
                            : activeView === 'Receivables'
                              ? 'Review reproducible aging, follow up delinquent accounts, and control suspension or reconnection.'
                              : activeView === 'Reports'
                                ? 'Preview, print, and export authorized management reports from one reconciled result.'
                                : activeView === 'Backup & recovery'
                                  ? 'Create verified server backups, review immutable results, and perform guarded recovery.'
                                  : 'Work with the records and actions available to your assigned role.'}
              </span>
            </div>
          </header>
          {session.user.mustChangePassword ? (
            <div className="password-notice" role="status">
              This development account must receive a unique password before
              production use.
            </div>
          ) : null}
          {activeView === 'Home' ? (
            <DashboardView
              permissions={session.user.permissions}
              onNavigate={setActiveView}
            />
          ) : activeView === 'Subscribers' || activeView === 'Services' ? (
            <SubscribersView
              permissions={session.user.permissions}
              {...(initialSubscriberId ? { initialSubscriberId } : {})}
              onProfileSelected={setInitialSubscriberId}
              onNavigate={setActiveView}
            />
          ) : activeView === 'Plans' ? (
            <PlansView
              canManage={session.user.permissions.includes('subscriber.manage')}
            />
          ) : activeView === 'Billing' ? (
            <BillingView
              canGenerate={session.user.permissions.includes(
                'billing.generate',
              )}
            />
          ) : activeView === 'Payments' ? (
            <PaymentsView
              canCreate={session.user.permissions.includes('payment.create')}
              canReverse={session.user.permissions.includes('payment.reverse')}
              canVerify={session.user.permissions.includes(
                'payment.verify_gcash',
              )}
            />
          ) : activeView === 'Collections' ? (
            <CollectionsView
              canReconcile={session.user.permissions.includes(
                'collection.reconcile',
              )}
            />
          ) : activeView === 'Receivables' ? (
            <ReceivablesView
              canManage={session.user.permissions.includes('receivable.manage')}
            />
          ) : activeView === 'Reports' ? (
            <ReportsView
              canExport={session.user.permissions.includes('report.export')}
              canAudit={session.user.permissions.includes('audit.view')}
              canViewSubscribers={session.user.permissions.includes(
                'subscriber.view',
              )}
            />
          ) : activeView === 'Backup & recovery' ? (
            <OperationsView
              canManageSettings={session.user.permissions.includes(
                'settings.manage',
              )}
              canRestore={session.user.permissions.includes('backup.restore')}
            />
          ) : (
            <section className="module-placeholder" aria-live="polite">
              <span>Module placeholder</span>
              <h2>{activeView}</h2>
              <p>
                Your account can access this module. Its workflow will be
                implemented and tested in the assigned task.
              </p>
            </section>
          )}
        </main>
      </div>
      {navigationOpen ? (
        <button
          aria-label="Close navigation panel"
          className="nav-scrim"
          onClick={() => setNavigationOpen(false)}
          type="button"
        />
      ) : null}
    </div>
  );
}

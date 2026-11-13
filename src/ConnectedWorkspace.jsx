import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, ShoppingCart, Package, Factory, Wallet, ChartNoAxesCombined, Settings, Layers, Menu, LogOut, ShieldCheck, Database, X, MoreHorizontal } from 'lucide-react';
import { Button, Card, Field, Badge, EmptyState, SectionTitle } from './components';
import { supabase } from './lib/supabase';
import { useAuth } from './auth/AuthProvider';
import Operations from './operations/Operations';
const pages = [ ['Dashboard','/',LayoutDashboard], ['Sales','/sales',ShoppingBag], ['Purchases','/purchases',ShoppingCart], ['Stock Management','/stock',Package], ['Production','/production',Factory], ['Expenses','/expenses',Wallet], ['Reports','/reports',ChartNoAxesCombined], ['Settings','/settings',Settings] ];
const bottomNavPages = [ ['Home','/',LayoutDashboard], ['Sales','/sales',ShoppingBag], ['Production','/production',Factory], ['Stock','/stock',Package] ];
export default function ConnectedWorkspace() {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const isMoreActive = ['/purchases', '/expenses', '/reports', '/settings'].some(p => location.pathname === p || location.pathname.startsWith(p + '/'));

  const titleMap = {
    '/': 'Dashboard',
    '/sales': 'Sales',
    '/purchases': 'Purchases',
    '/stock': 'Stock Management',
    '/production': 'Production',
    '/expenses': 'Expenses',
    '/reports': 'Reports',
    '/settings': 'Settings'
  };
  const currentTitle = titleMap[location.pathname] || 'Dashboard';
  const userInitials = profile?.display_name
    ? profile.display_name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'JM';

  useEffect(() => {
    let alive = true;
    setBusy(true); setError(''); setProfile(null); setSettings(null);
    async function load() {
      try {
        const profileResult = await supabase.from('profiles').select('id, display_name, role, is_active').eq('id', session.user.id).maybeSingle();
        if (profileResult.error) throw profileResult.error;
        if (!alive) return;
        setProfile(profileResult.data);
        if (profileResult.data?.is_active) {
          const result = await supabase.from('business_settings').select('*').eq('id', true).single();
          if (result.error) throw result.error;
          if (alive) setSettings(result.data);
        }
      } catch { if (alive) setError('Unable to load your workspace. Check the database migration, network connection, and account permissions.'); }
      finally { if (alive) setBusy(false); }
    }
    load();
    return () => { alive = false; };
  }, [session.user.id, reload]);
  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    try { await signOut(); } catch { setError('Sign-out failed. Please try again.'); setSigningOut(false); }
  }
  if (busy) return <div className="auth-loading" role="status">Loading your workspace…</div>;
  if (error || !profile?.is_active || !settings) return <div className="auth-loading"><Card><EmptyState title={error?'Unable to open workspace':'Account awaiting approval'} description={error||'Your login is valid. A project administrator must activate your profile before you can access business records.'} action={<><Button onClick={()=>setReload(v=>v+1)}>Check again</Button><Button variant="secondary" disabled={signingOut} onClick={logout}>Sign out</Button></>}/></Card></div>;
  return (
    <div className="app">
      {mobile && <button className="scrim" onClick={() => setMobile(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <div className="sidebar-brand-row">
          <NavLink to="/" className="brand" onClick={() => setMobile(false)}>
            <span className="jm-logo"><img src="/jm-bricks-logo.png" alt="JM Bricks logo" /></span>
            <span className="brand-text">JM BRICKS<small>BUSINESS MANAGER</small></span>
          </NavLink>
          <button className="icon-button mobile-close-btn" onClick={() => setMobile(false)} aria-label="Close navigation">
            <X size={20} />
          </button>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {pages.map(([name, path, Icon]) => (
            <NavLink key={path} to={path} end onClick={() => setMobile(false)}>
              <Icon size={20} />
              <span>{name}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar">{userInitials}</span>
            <div className="brand-text">
              <strong>{profile.display_name || 'Team member'}</strong>
              <small>{profile.role === 'owner' ? 'Business Owner' : profile.role || 'Staff'}</small>
            </div>
            <button className="icon-button sidebar-logout-btn" disabled={signingOut} onClick={logout} title="Sign out" aria-label="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <div className="header-left">
            <button className="icon-button mobile-menu" onClick={() => setMobile(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <span className="mobile-brand-icon" aria-hidden="true"><img src="/jm-bricks-logo.png" alt="" /></span>
            <div className="header-breadcrumb">
              <span className="header-business-name">{settings.business_name}</span>
              <span className="header-breadcrumb-slash">/</span>
              <strong className="header-page-title">{currentTitle}</strong>
            </div>
          </div>
          <div className="header-right">
            <span
              className="avatar small header-avatar"
              title={`${profile.display_name || 'Team member'} (${profile.role === 'owner' ? 'Business Owner' : profile.role || 'Staff'})`}
              aria-label={`${profile.display_name || 'Team member'} profile`}
            >
              {userInitials}
            </span>
            <Button variant="secondary" className="header-signout-btn" disabled={signingOut} onClick={logout} title="Sign out of JM BRICKS">
              <LogOut size={15} />
              <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </Button>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/settings" element={<BusinessSettings settings={settings} onSaved={setSettings} canEdit={profile.role === 'owner'} />} />
            <Route path="/*" element={<Operations profile={profile} settings={settings} />} />
          </Routes>
        </main>
        <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
          {bottomNavPages.map(([name, path, Icon]) => (
            <NavLink
              key={path}
              to={path}
              end
              className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setMobile(false)}
            >
              <Icon size={20} />
              <span>{name}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className={`mobile-nav-item ${isMoreActive || mobile ? 'active' : ''}`}
            onClick={() => setMobile(v => !v)}
            aria-label="More navigation options"
          >
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
function BusinessSettings({ settings, onSaved, canEdit }) {
  const [name,setName]=useState(settings.business_name);
  const [currency,setCurrency]=useState(settings.currency);
  const [timezone,setTimezone]=useState(settings.timezone);
  const [confirmed,setConfirmed]=useState(settings.costing_confirmed);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const lock=useRef(false);
  async function save(e) {
    e.preventDefault();
    if (!canEdit||lock.current) return;
    if (!name.trim()) {setError('Enter a business name.');return;}
    lock.current=true;setBusy(true);setError('');setMessage('');
    try {
      const {data,error}=await supabase.from('business_settings').update({business_name:name.trim(),currency,timezone,costing_confirmed:confirmed}).eq('id',true).eq('updated_at',settings.updated_at).select().maybeSingle();
      if(error) throw error;
      if(!data) throw new Error('These settings changed or your access was removed. Reload the page before trying again.');
      onSaved(data);setMessage('Business settings saved successfully.');
    } catch(err) {setError(err.message||'Unable to save settings. Please try again.');}
    finally {lock.current=false;setBusy(false);}
  }
  return (
    <div className="settings-page-layout">
      <div className="page-header-block">
        <div>
          <span className="eyebrow">PREFERENCES & CONFIGURATION</span>
          <h1>Business Settings</h1>
          <p>{canEdit ? 'Manage your business name, currency, timezone, and inventory costing policy.' : 'View business configuration. Only the owner can make changes.'}</p>
        </div>
      </div>
      <Card className="settings-card">
        <SectionTitle title="General Business Profile" subtitle={canEdit ? 'Saved securely in your database.' : 'Only the owner can change these settings.'} />
        <form onSubmit={save} className="settings-form">
          <fieldset disabled={!canEdit || busy}>
            <div className="form-grid">
              <Field label="Business name" required maxLength={160} value={name} onChange={e=>setName(e.target.value)} />
              <Field label="Product dimension unit">
                <input value="Millimetres (mm)" readOnly />
              </Field>
            </div>
            
            <div className="settings-section-divider" />
            <h3 className="settings-subheading">Regional & Financial Settings</h3>
            
            <div className="form-grid">
              <Field label="Display Currency">
                <select value={currency} onChange={e=>setCurrency(e.target.value)}>
                  {['INR','AED','USD','SAR'].map(v=><option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Business Timezone">
                <select value={timezone} onChange={e=>setTimezone(e.target.value)}>
                  {['Asia/Kolkata','Asia/Calcutta','Asia/Dubai','Asia/Riyadh','Asia/Muscat','UTC'].map(v=><option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
            </div>
            <p className="help">Currency cannot be changed after transactions exist. Amounts are not converted.</p>

            <div className="settings-section-divider" />
            <h3 className="settings-subheading">Inventory Costing Policy</h3>

            <div className="notice costing-notice">
              <div>
                <strong>Inventory Costing: Moving Weighted Average</strong>
                <p>Incoming costs are averaged across available stock. Each sale retains its cost at the time of sale. Unknown costs remain unknown, not zero. Weighted average costs are saved with each stock movement.</p>
              </div>
            </div>
            <label className="checkbox-field">
              <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />
              <span>Use moving weighted average costing for this business.</span>
            </label>
          </fieldset>
          {error && <div role="alert" className="auth-error">{error}</div>}
          {message && <div role="status" className="notice success-notice">{message}</div>}
          {canEdit && (
            <div className="settings-actions">
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save Settings'}
              </Button>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}

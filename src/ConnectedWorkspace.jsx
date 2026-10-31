import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, ShoppingCart, Package, Factory, Wallet, ChartNoAxesCombined, Settings, Layers, Menu, LogOut, ShieldCheck, Database } from 'lucide-react';
import { Button, Card, Field, Badge, EmptyState, SectionTitle } from './components';
import { supabase } from './lib/supabase';
import { useAuth } from './auth/AuthProvider';
import Operations from './operations/Operations';
const pages = [ ['Dashboard','/',LayoutDashboard], ['Sales','/sales',ShoppingBag], ['Purchases','/purchases',ShoppingCart], ['Stock Management','/stock',Package], ['Production','/production',Factory], ['Expenses','/expenses',Wallet], ['Reports','/reports',ChartNoAxesCombined], ['Settings','/settings',Settings] ];
export default function ConnectedWorkspace() {
  const { session, signOut } = useAuth();
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
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
  return <div className="app">{mobile&&<button className="scrim" onClick={()=>setMobile(false)} aria-label="Close navigation"/>}<aside className={`sidebar ${mobile?'open':''}`}><NavLink to="/" className="brand"><span className="jm-logo"><img src="/jm-bricks-logo.png" alt="JM Bricks logo"/></span><span className="brand-text">JM BRICKS<small>BUSINESS MANAGER</small></span></NavLink><div className="nav-caption">WORKSPACE</div><nav>{pages.map(([name,path,Icon])=><NavLink key={path} to={path} end onClick={()=>setMobile(false)}><Icon size={20}/><span>{name}</span></NavLink>)}</nav><div className="sidebar-bottom"><div className="preview-note"><ShieldCheck size={16}/> Authenticated workspace<small>Phase 4 · operations & reports</small></div><div className="profile"><span className="avatar">JM</span><div className="brand-text"><strong>{profile.display_name||'Team member'}</strong><small>{profile.role}</small></div></div></div></aside><div className="workspace"><header><div className="header-left"><button className="icon-button mobile-menu" onClick={()=>setMobile(true)} aria-label="Open navigation"><Menu/></button><strong>{settings.business_name}</strong><Badge>Connected</Badge></div><Button variant="secondary" disabled={signingOut} onClick={logout}><LogOut size={15}/>{signingOut?'Signing out…':'Sign out'}</Button></header><main><Routes><Route path="/settings" element={<BusinessSettings settings={settings} onSaved={setSettings} canEdit={profile.role==='owner'}/>}/><Route path="/*" element={<Operations profile={profile} settings={settings}/>}/></Routes></main></div></div>;
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
      onSaved(data);setMessage('Business settings saved.');
    } catch(err) {setError(err.message||'Unable to save settings. Please try again.');}
    finally {lock.current=false;setBusy(false);}
  }
  return <Card className="settings-card"><SectionTitle title="Business settings" subtitle={canEdit?'Saved securely in your database.':'Only the owner can change these settings.'}/><form onSubmit={save}><fieldset disabled={!canEdit||busy}><Field label="Business name" required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/><Field label="Currency"><select value={currency} onChange={e=>setCurrency(e.target.value)}>{['INR','AED','USD','SAR'].map(v=><option key={v}>{v}</option>)}</select></Field><p className="help">Currency cannot be changed after transactions exist. Amounts are not converted.</p><Field label="Business timezone"><select value={timezone} onChange={e=>setTimezone(e.target.value)}>{['Asia/Kolkata','Asia/Calcutta','Asia/Dubai','Asia/Riyadh','Asia/Muscat','UTC'].map(v=><option key={v}>{v}</option>)}</select></Field><Field label="Dimension unit"><input value="Millimetres (mm)" readOnly/></Field><div className="notice"><span><strong>Inventory costing: moving weighted average</strong><br/>Incoming costs are averaged across available stock. Each sale retains its cost at the time of sale. Unknown costs must remain unknown, not zero. Weighted average costs are saved with each stock movement. Transactions use posting order; older stock dates are rejected.</span></div><label className="checkbox-field"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Use moving weighted average for this business.</label></fieldset>{error&&<div role="alert" className="auth-error">{error}</div>}{message&&<div role="status" className="notice">{message}</div>}{canEdit&&<Button type="submit" disabled={busy}>{busy?'Saving…':'Save settings'}</Button>}</form></Card>;
}

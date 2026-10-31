import React, { useRef, useState } from 'react';
import { Layers, LockKeyhole, ArrowRight, AlertCircle } from 'lucide-react';
import { Button, Field } from '../components';
import { configuration, supabase, recoveryRedirect } from '../lib/supabase';
import { useAuth } from './AuthProvider';
export default function AuthScreen({ onPreview }) {
  const { recovering, session, finishRecovery, error: sessionError } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const reset = recovering && Boolean(session);
  async function submit(event) {
    event.preventDefault();
    if (lock.current || !supabase) return;
    setError(''); setMessage('');
    if ((reset || mode === 'signup') && password !== confirm) { setError('The passwords do not match.'); return; }
    lock.current = true; setBusy(true);
    try {
      let result;
      if (reset) result = await supabase.auth.updateUser({ password });
      else if (mode === 'forgot') result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: recoveryRedirect() });
      else if (mode === 'signup') result = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
      else result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) {
        const code = result.error.code;
        if (code === 'invalid_credentials') throw new Error('The email or password is incorrect.');
        if (code === 'email_not_confirmed') throw new Error('Please confirm your email before signing in.');
        if (result.error.status === 429) throw new Error('Too many attempts. Please wait a moment and try again.');
        throw new Error(reset ? 'Password update failed. Use a new reset link and try again.' : 'Unable to complete this request. Check your connection and account configuration.');
      }
      if (reset) { setPassword(''); finishRecovery(); }
      else if (mode === 'signup') {setPassword('');setConfirm('');setMessage('If registration is available for this email, check your inbox to confirm it in this browser. New accounts require owner approval before business data is accessible.');}
      else if (mode === 'forgot') setMessage('If an account exists for this email, a reset link will be sent. Open it in this browser.');
    } catch (err) { setError(err.message || 'Unable to connect. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="auth-page"><section className="auth-intro"><div className="auth-brand"><span className="jm-logo"><img src="/jm-bricks-logo.png" alt="JM Bricks logo"/></span><strong>JM BRICKS</strong></div><span className="eyebrow">A STRONGER FOUNDATION</span><h1>Your business.<br/>All in one place.</h1><p>Sales, production, stock, and everyday decisions — organised for a better business day.</p><div className="auth-security"><LockKeyhole size={18}/><span>Private workspace · Access for approved team members</span></div></section><section className="auth-panel"><div className="auth-card"><span className="eyebrow">JM BRICKS · BUSINESS MANAGER</span><h2>{!configuration.configured?'Connect your workspace':reset?'Choose a new password':mode==='forgot'?'Reset your password':mode==='signup'?'Create your account':'Welcome back'}</h2><p>{!configuration.configured?'Your database and sign-in foundation is ready to configure.':reset?'Use a strong password with at least 12 characters.':mode==='forgot'?'Enter your email to receive a recovery link.':mode==='signup'?'Register with your email. Business access requires owner approval.':'Sign in to your JM Bricks account.'}</p>{configuration.configured?<form onSubmit={submit}>{!reset&&<Field label="Email address" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254}/ >}{(reset||mode==='login'||mode==='signup')&&<Field label={reset?'New password':'Password'} type="password" autoComplete={reset||mode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={reset||mode==='signup'?12:undefined} required/>}{(reset||mode==='signup')&&<Field label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={12} required/>}{(error||sessionError)&&<div className="auth-error" role="alert"><AlertCircle size={17}/>{error||sessionError}</div>}{message&&<div className="notice" role="status">{message}</div>}{recovering&&!session&&<div className="notice">The recovery link has not established a session. Request a new link, then open it in this browser.</div>}<Button type="submit" disabled={busy}>{busy?'Please wait…':reset?'Update password':mode==='forgot'?'Send reset link':mode==='signup'?'Create account':'Sign in'}<ArrowRight size={16}/></Button>{!reset&&<button className="auth-link" type="button" disabled={busy} onClick={()=>{setMode(mode==='login'?'forgot':'login');setError('');setMessage('')}}>{mode==='login'?'Forgot your password?':'Back to sign in'}</button>}</form>:<><div className="notice">No Supabase project is connected yet. Live sign-in and database access are unavailable until setup is completed.</div>{configuration.error&&<div className="auth-error" role="alert">{configuration.error}</div>}<ol className="setup-list"><li>Run the three database migrations, then the production register, production lines and brand-name SQL updates.</li><li>Add your Supabase URL and public key to <code>.env.local</code>.</li><li>Create and approve the owner's account.</li><li>Rebuild and deploy the application.</li></ol><p className="help">Step-by-step instructions are included in the ZIP: <strong>docs/Phase 4 Setup.md</strong>.</p></>}<div className="auth-footer">{configuration.configured?'Private account · JM Bricks':'Demo figures are examples. Real records require database connection.'}{onPreview&&<button type="button" className="auth-link" style={{marginTop:'12px'}} onClick={onPreview}>Explore demo preview mode →</button>}</div></div></section></div>;
}

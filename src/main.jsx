import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import AuthScreen from './auth/AuthScreen';
import ConnectedWorkspace from './ConnectedWorkspace';
import PreviewApp from './PreviewApp';
import { configuration } from './lib/supabase';
import './styles.css';

function Application() {
  const { session, loading, recovering } = useAuth();
  const [showPreview, setShowPreview] = useState(() => window.location.search.includes('preview') || window.location.hash.includes('preview'));
  if (showPreview) return <HashRouter><div className="preview-return"><small>Sample preview mode</small><button onClick={() => setShowPreview(false)}>Return to sign in</button></div><PreviewApp /></HashRouter>;
  if (loading) return <div className="auth-loading" role="status">Checking your session…</div>;
  if (!configuration.configured || !session || recovering) return <AuthScreen onPreview={() => setShowPreview(true)} />;
  return <HashRouter><ConnectedWorkspace key={session.user.id}/></HashRouter>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><AuthProvider><Application/></AuthProvider></React.StrictMode>);

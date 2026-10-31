import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import AuthScreen from './auth/AuthScreen';
import ConnectedWorkspace from './ConnectedWorkspace';
import { configuration } from './lib/supabase';
import './styles.css';

function Application() {
  const { session, loading, recovering } = useAuth();
  if (loading) return <div className="auth-loading" role="status">Checking your session…</div>;
  if (!configuration.configured || !session || recovering) return <AuthScreen/>;
  return <HashRouter><ConnectedWorkspace key={session.user.id}/></HashRouter>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><AuthProvider><Application/></AuthProvider></React.StrictMode>);

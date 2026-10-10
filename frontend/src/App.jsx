import './App.css'
import { useAuth } from './contexts/useAuth'
import AuthScreen from './components/auth/AuthScreen'
import JoinScreen from './components/join/JoinScreen'
import PlatformAdminScreen from './components/auth/PlatformAdminScreen'
import PendingSubscriptionScreen from './components/auth/PendingSubscriptionScreen'
import DashboardPage from './pages/DashboardPage'
import CustomerPage from './pages/CustomerPage'

export default function App() {
  const { session, profile, loading, error, signIn, signUp, signOut, clearError } = useAuth()
  const businessJoinMatch = window.location.pathname.match(/^\/join\/business\/([^/]+)$/)
  const legacyProgramJoinMatch = window.location.pathname.match(/^\/join\/([^/]+)$/)

  if (loading) return <div className="app-state"><strong>Loading your workspace...</strong></div>
  if (businessJoinMatch) return <JoinScreen businessSlug={businessJoinMatch[1]} session={session} onSignIn={signIn} onSignUp={signUp} onClearError={clearError} />
  if (legacyProgramJoinMatch) return <JoinScreen programId={legacyProgramJoinMatch[1]} session={session} onSignIn={signIn} onSignUp={signUp} onClearError={clearError} />
  if (!session) return <AuthScreen onSignIn={signIn} onSignUp={signUp} onClearError={clearError} error={error} />
  if (profile?.role === 'PLATFORM_ADMIN') return <PlatformAdminScreen session={session} profile={profile} onSignOut={signOut} />
  if (profile?.role === 'BUSINESS_OWNER' && profile.pendingSubscription && profile.pendingSubscription.status !== 'active') return <PendingSubscriptionScreen subscription={profile.pendingSubscription} onRefresh={() => window.location.reload()} onSignOut={signOut} />
  if (profile?.role === 'CUSTOMER') return <CustomerPage session={session} profile={profile} onSignOut={signOut} />
  return <DashboardPage session={session} profile={profile} onSignOut={signOut} />
}

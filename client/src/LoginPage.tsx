import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { Zap } from 'lucide-react'

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('demo@opsflow.com')
  const [password, setPassword] = useState('password123')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isRegister) {
        await register(email, password, displayName)
      } else {
        await login(email, password)
      }
      toast.success('Welcome to OpsFlow!')
      navigate('/')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Zap size={32} color="var(--accent-blue)" />
          <h1>OpsFlow</h1>
        </div>
        <p>Operations Under Pressure — Manage work, track issues, collaborate in real-time.</p>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                className="form-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="John Doe"
                required={isRegister}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              required
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: 8, padding: '11px' }}>
            {loading ? <div className="loading-spinner" /> : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            className="btn btn-ghost"
            onClick={() => setIsRegister(!isRegister)}
            style={{ fontSize: '0.8rem' }}
          >
            {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
          </button>
        </div>

        <div style={{
          marginTop: 20,
          padding: 12,
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
        }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Demo Credentials</strong><br />
          Email: demo@opsflow.com<br />
          Password: password123<br />
          <span style={{ opacity: 0.7 }}>Other users: alice@, bob@, carol@, dave@, eve@ (same password)</span>
        </div>
      </div>
    </div>
  )
}

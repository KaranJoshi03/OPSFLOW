import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { usersAPI } from '../api/client'
import {
  LayoutDashboard,
  ListTodo,
  Users,
  Bell,
  LogOut,
  Zap,
} from 'lucide-react'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => usersAPI.notifications().then((r) => r.data),
    refetchInterval: 30000,
  })

  const unreadCount = notifData?.unreadCount || 0

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const initials = user?.displayName
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <a href="/" className="sidebar-logo">
            <Zap size={24} />
            OpsFlow
          </a>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Main</div>
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <LayoutDashboard size={18} />
              Dashboard
            </NavLink>
            <NavLink to="/work-items" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <ListTodo size={18} />
              Work Items
            </NavLink>
            <NavLink to="/teams" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Users size={18} />
              Teams
            </NavLink>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Alerts</div>
            <button className="nav-link" onClick={() => {}}>
              <Bell size={18} />
              Notifications
              {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </button>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div className="user-details">
              <div className="user-name">{user?.displayName}</div>
              <div className="user-email">{user?.email}</div>
            </div>
          </div>
          <button
            className="nav-link"
            onClick={handleLogout}
            style={{ marginTop: 8, color: 'var(--accent-red)' }}
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

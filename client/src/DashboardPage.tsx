import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { dashboardAPI } from '../api/client'
import { AlertTriangle, CheckCircle, Clock, Pause, ArrowRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status.replace('_', ' ')}</span>
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`badge badge-${priority.toLowerCase()}`}>{priority}</span>
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardAPI.get().then((r) => r.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return (
      <>
        <div className="page-header">
          <h1>Dashboard</h1>
          <p>Your personal operations overview</p>
        </div>
        <div className="page-content">
          <div className="loading-page" style={{ height: 300 }}>
            <div className="loading-spinner" />
          </div>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <div className="page-header"><h1>Dashboard</h1></div>
        <div className="page-content">
          <div className="empty-state">
            <AlertTriangle size={48} />
            <h3>Failed to load dashboard</h3>
            <p>Please try refreshing the page.</p>
          </div>
        </div>
      </>
    )
  }

  const { myAssigned, needsAttention, recentActivity, teamStats } = data

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Your personal operations overview</p>
      </div>
      <div className="page-content">
        {/* Stats Row */}
        <div className="grid-4" style={{ marginBottom: 24 }}>
          {teamStats?.map((stat: any) => (
            <div className="stat-card" key={stat.team?.id}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                {stat.team?.name}
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>{stat.open}</div>
                  <div className="stat-label">Open</div>
                </div>
                <div>
                  <div className="stat-value" style={{ color: 'var(--accent-green)' }}>{stat.inProgress}</div>
                  <div className="stat-label">Active</div>
                </div>
                <div>
                  <div className="stat-value" style={{ color: 'var(--accent-red)' }}>{stat.blocked}</div>
                  <div className="stat-label">Blocked</div>
                </div>
                <div>
                  <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{stat.total}</div>
                  <div className="stat-label">Total</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid-2">
          {/* My Assigned Items */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📋 My Assigned Items</h2>
              <Link to="/work-items?assignedToMe=true" className="btn btn-ghost btn-sm">
                View All <ArrowRight size={14} />
              </Link>
            </div>
            {myAssigned?.length === 0 ? (
              <div className="empty-state" style={{ padding: 30 }}>
                <CheckCircle size={32} />
                <h3>All clear!</h3>
                <p>No items assigned to you</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myAssigned?.slice(0, 8).map((item: any) => (
                  <Link to={`/work-items/${item.id}`} key={item.id} className="work-item-card">
                    <div className="item-header">
                      <span className="item-id">{item.identifier}</span>
                      <PriorityBadge priority={item.priority} />
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="item-title">{item.title}</div>
                    <div className="item-meta">
                      <span className="tag">{item.team?.name}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Needs Attention */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">⚠️ Needs Attention</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Unassigned items in your teams
              </span>
            </div>
            {needsAttention?.length === 0 ? (
              <div className="empty-state" style={{ padding: 30 }}>
                <CheckCircle size={32} />
                <h3>All covered</h3>
                <p>All items are assigned</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {needsAttention?.slice(0, 6).map((item: any) => (
                  <Link to={`/work-items/${item.id}`} key={item.id} className="work-item-card">
                    <div className="item-header">
                      <span className="item-id">{item.identifier}</span>
                      <PriorityBadge priority={item.priority} />
                    </div>
                    <div className="item-title">{item.title}</div>
                    <div className="item-meta">
                      <span className="tag">{item.team?.name}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        <Clock size={12} style={{ verticalAlign: 'middle' }} />{' '}
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header">
            <h2 className="card-title">🕐 Recent Activity</h2>
          </div>
          <div className="timeline">
            {recentActivity?.slice(0, 15).map((activity: any) => (
              <div className="timeline-item" key={activity.id}>
                <div className="timeline-content">
                  <strong>{activity.user?.displayName}</strong>{' '}
                  {activity.action.toLowerCase().replace('_', ' ')}{' '}
                  <Link
                    to={`/work-items/${activity.workItem?.id}`}
                    style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}
                  >
                    {activity.workItem?.identifier} — {activity.workItem?.title}
                  </Link>
                  {activity.fieldName && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      {' '}({activity.oldValue} → {activity.newValue})
                    </span>
                  )}
                </div>
                <div className="timeline-time">
                  {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

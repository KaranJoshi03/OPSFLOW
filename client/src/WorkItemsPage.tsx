import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { workItemsAPI, teamsAPI } from '../api/client'
import { Plus, Search, Filter, AlertTriangle, FileText } from 'lucide-react'
import { format } from 'date-fns'

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status.replace('_', ' ')}</span>
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`badge badge-${priority.toLowerCase()}`}>{priority}</span>
}

function TypeBadge({ type }: { type: string }) {
  return <span className={`badge badge-${type.toLowerCase()}`}>{type.replace('_', ' ')}</span>
}

export default function WorkItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const queryClient = useQueryClient()

  // Form State
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [teamId, setTeamId] = useState('')

  // Queries
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['work-items', searchParams.toString()],
    queryFn: () => {
      const params = Object.fromEntries(searchParams.entries())
      return workItemsAPI.list(params).then((r) => r.data)
    },
  })

  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsAPI.list().then((r) => r.data),
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => workItemsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] })
      setIsCreateModalOpen(false)
      setTitle('')
      setDescription('')
      setTeamId('')
    },
  })

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ title, description, teamId })
  }

  const items = itemsData?.items || []
  const teams = teamsData?.teams || []

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Work Items</h1>
          <p>Manage and track operational issues</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
          <Plus size={16} /> New Item
        </button>
      </div>

      <div className="page-content">
        <div className="filters-bar">
          <div className="search-input">
            <Search />
            <input
              type="text"
              placeholder="Search items..."
              value={searchParams.get('search') || ''}
              onChange={(e) => {
                const newParams = new URLSearchParams(searchParams)
                if (e.target.value) newParams.set('search', e.target.value)
                else newParams.delete('search')
                setSearchParams(newParams)
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <select
              className="form-select"
              style={{ width: 'auto', padding: '6px 32px 6px 12px' }}
              value={searchParams.get('teamId') || ''}
              onChange={(e) => {
                const newParams = new URLSearchParams(searchParams)
                if (e.target.value) newParams.set('teamId', e.target.value)
                else newParams.delete('teamId')
                setSearchParams(newParams)
              }}
            >
              <option value="">All Teams</option>
              {teams.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            <select
              className="form-select"
              style={{ width: 'auto', padding: '6px 32px 6px 12px' }}
              value={searchParams.get('status') || ''}
              onChange={(e) => {
                const newParams = new URLSearchParams(searchParams)
                if (e.target.value) newParams.set('status', e.target.value)
                else newParams.delete('status')
                setSearchParams(newParams)
              }}
            >
              <option value="">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="BLOCKED">Blocked</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {itemsLoading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div className="loading-spinner" style={{ display: 'inline-block' }} />
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <FileText size={48} />
              <h3>No work items found</h3>
              <p>Try adjusting your filters or create a new one.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Title</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Priority</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Assignee</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <Link to={`/work-items/${item.id}`} style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}>
                        {item.identifier}
                      </Link>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Link to={`/work-items/${item.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                        {item.title}
                      </Link>
                      <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.team?.name}</span>
                        <TypeBadge type={item.type} />
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={item.status} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <PriorityBadge priority={item.priority} />
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>
                      {item.assignedTo ? item.assignedTo.displayName : <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {format(new Date(item.updatedAt), 'MMM d, yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsCreateModalOpen(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h2>Create Work Item</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setIsCreateModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Team</label>
                  <select
                    className="form-select"
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    required
                  >
                    <option value="">Select Team...</option>
                    {teams.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input
                    className="form-input"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Short, descriptive title"
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Detailed description of the issue or task..."
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={createMutation.isPending || !teamId || !title}>
                  {createMutation.isPending ? 'Creating...' : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

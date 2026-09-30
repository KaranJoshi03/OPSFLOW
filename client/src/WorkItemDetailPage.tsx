import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workItemsAPI, usersAPI, aiAPI } from '../api/client'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { formatDistanceToNow, format } from 'date-fns'
import { 
  ArrowLeft, Clock, MessageSquare, AlertCircle, Check, 
  RefreshCw, Bot, User, Tag, Sparkles
} from 'lucide-react'
import { io, Socket } from 'socket.io-client'

export default function WorkItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const queryClient = useQueryClient()
  
  const [comment, setComment] = useState('')
  const [activeUsers, setActiveUsers] = useState<string[]>([])
  const [socket, setSocket] = useState<Socket | null>(null)

  // Fetch Item
  const { data: itemData, isLoading, error } = useQuery({
    queryKey: ['work-item', id],
    queryFn: () => workItemsAPI.get(id!).then(r => r.data),
    retry: false,
  })

  // Fetch Users for Assignment
  const { data: usersData } = useQuery({
    queryKey: ['users', itemData?.item?.teamId],
    queryFn: () => usersAPI.list({ teamId: itemData?.item?.teamId }).then(r => r.data),
    enabled: !!itemData?.item?.teamId,
  })

  // WebSocket Setup
  useEffect(() => {
    if (!token || !id) return

    const newSocket = io(window.location.origin, {
      auth: { token }
    })

    newSocket.on('connect', () => {
      newSocket.emit('join:workItem', id)
    })

    newSocket.on('presence:viewing', (data) => {
      if (data.userId !== user?.id) {
        setActiveUsers(prev => Array.from(new Set([...prev, data.userId])))
      }
    })

    newSocket.on('presence:left', (data) => {
      setActiveUsers(prev => prev.filter(uId => uId !== data.userId))
    })

    setSocket(newSocket)

    return () => {
      newSocket.emit('leave:workItem', id)
      newSocket.disconnect()
    }
  }, [id, token, user?.id])

  // Mutations
  const updateStatus = useMutation({
    mutationFn: (status: string) => 
      workItemsAPI.changeStatus(id!, status, itemData!.item.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-item', id] })
      toast.success('Status updated')
    },
    onError: (err: any) => {
      if (err.response?.status === 409) {
        toast.error('Version conflict! Someone else modified this item. Refreshing...')
        queryClient.invalidateQueries({ queryKey: ['work-item', id] })
      } else {
        toast.error(err.response?.data?.error || 'Failed to update status')
      }
    }
  })

  const assign = useMutation({
    mutationFn: (userId: string | null) => 
      workItemsAPI.assign(id!, userId, itemData!.item.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-item', id] })
      toast.success('Assignment updated')
    },
    onError: (err: any) => {
      if (err.response?.status === 409) {
        toast.error('Version conflict! Someone else modified this item.')
        queryClient.invalidateQueries({ queryKey: ['work-item', id] })
      } else {
        toast.error(err.response?.data?.error || 'Failed to assign')
      }
    }
  })

  const postComment = useMutation({
    mutationFn: () => workItemsAPI.addComment(id!, comment),
    onSuccess: () => {
      setComment('')
      queryClient.invalidateQueries({ queryKey: ['work-item', id] })
    }
  })

  const acceptAI = useMutation({
    mutationFn: ({ field, value }: { field: string, value: any }) => 
      workItemsAPI.acceptAISuggestion(id!, field, value, itemData!.item.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-item', id] })
      toast.success('AI suggestion applied')
    }
  })

  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="loading-spinner" />
      </div>
    )
  }

  if (error || !itemData) {
    return (
      <div className="empty-state">
        <AlertCircle size={48} color="var(--accent-red)" />
        <h2>Item not found</h2>
        <button className="btn btn-secondary" onClick={() => navigate('/work-items')} style={{ marginTop: 16 }}>
          Back to List
        </button>
      </div>
    )
  }

  const item = itemData.item
  const { activityLogs, comments, aiSuggestions } = item

  return (
    <>
      <div className="page-header" style={{ paddingBottom: 16 }}>
        <button 
          className="btn btn-ghost btn-sm" 
          onClick={() => navigate(-1)}
          style={{ marginBottom: 12, padding: 0 }}
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span className="item-id" style={{ color: 'var(--accent-blue)', fontWeight: 600, fontFamily: 'monospace' }}>
                {item.identifier}
              </span>
              <span className={`badge badge-${item.status.toLowerCase()}`}>{item.status.replace('_', ' ')}</span>
              <span className={`badge badge-${item.priority.toLowerCase()}`}>{item.priority}</span>
              <span className={`badge badge-${item.type.toLowerCase()}`}>{item.type.replace('_', ' ')}</span>
            </div>
            <h1 style={{ fontSize: '1.5rem', lineHeight: 1.2 }}>{item.title}</h1>
          </div>
          
          <div style={{ display: 'flex', gap: 8 }}>
            {activeUsers.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-teal)', fontSize: '0.8rem', marginRight: 16 }}>
                <span className="animate-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-teal)' }} />
                {activeUsers.length} other(s) viewing
              </div>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['work-item', id] })}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="page-content" style={{ padding: '24px 28px' }}>
        <div className="detail-layout">
          {/* Main Content Area */}
          <div className="detail-main">
            {/* AI Suggestions Box */}
            {aiSuggestions && (
              <div className="ai-suggestion">
                <div className="ai-suggestion-header">
                  <Sparkles size={16} /> AI Triage Insights
                </div>
                <div style={{ fontSize: '0.9rem', marginBottom: 12 }}>
                  {aiSuggestions.summary}
                </div>
                
                {/* Priority Suggestion */}
                {aiSuggestions.suggestedPriority !== item.priority && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.85rem', marginBottom: 8 }}>
                    <div>
                      Suggest changing priority to <strong style={{ color: 'var(--accent-red)' }}>{aiSuggestions.suggestedPriority}</strong>
                      <br/><span style={{ color: 'var(--text-muted)' }}>{aiSuggestions.priorityReason}</span>
                    </div>
                    <button 
                      className="btn btn-secondary btn-sm"
                      onClick={() => acceptAI.mutate({ field: 'priority', value: aiSuggestions.suggestedPriority })}
                      disabled={acceptAI.isPending}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: 1.6 }}>
                {item.description}
              </div>
            </div>

            {/* Comments Section */}
            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={18} /> Discussion
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              {comments.map((c: any) => (
                <div key={c.id} style={{ display: 'flex', gap: 12 }}>
                  <div className="user-avatar" style={{ width: 32, height: 32 }}>
                    {c.author.displayName[0]}
                  </div>
                  <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <strong style={{ fontSize: '0.85rem' }}>{c.author.displayName}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{c.content}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Comment Input */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="user-avatar" style={{ width: 32, height: 32 }}>
                {user?.displayName?.[0]}
              </div>
              <div style={{ flex: 1 }}>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: 80, marginBottom: 8 }}
                  placeholder="Add a comment... (markdown supported soon)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    className="btn btn-primary"
                    disabled={!comment.trim() || postComment.isPending}
                    onClick={() => postComment.mutate()}
                  >
                    Post Comment
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Area */}
          <div className="detail-sidebar">
            <div className="card" style={{ marginBottom: 16 }}>
              <h4 style={{ marginBottom: 16, fontSize: '0.9rem' }}>Details</h4>
              
              <div className="detail-field">
                <div className="detail-field-label">Status</div>
                <select 
                  className="form-select"
                  value={item.status}
                  onChange={(e) => updateStatus.mutate(e.target.value)}
                  disabled={updateStatus.isPending || item.status === 'CLOSED'}
                >
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="BLOCKED">Blocked</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                  <option value="REOPENED">Reopened</option>
                </select>
              </div>

              <div className="detail-field">
                <div className="detail-field-label">Assignee</div>
                <select 
                  className="form-select"
                  value={item.assignedToId || ''}
                  onChange={(e) => assign.mutate(e.target.value || null)}
                  disabled={assign.isPending}
                >
                  <option value="">Unassigned</option>
                  {usersData?.users?.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.displayName}</option>
                  ))}
                </select>
              </div>

              <div className="detail-field">
                <div className="detail-field-label">Team</div>
                <div className="detail-field-value">{item.team?.name}</div>
              </div>

              <div className="detail-field">
                <div className="detail-field-label">Reporter</div>
                <div className="detail-field-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <User size={14} /> {item.createdBy?.displayName}
                </div>
              </div>

              <div className="detail-field">
                <div className="detail-field-label">Created</div>
                <div className="detail-field-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} /> {format(new Date(item.createdAt), 'MMM d, yyyy h:mm a')}
                </div>
              </div>
            </div>

            {/* Activity Timeline */}
            <div className="card">
              <h4 style={{ marginBottom: 16, fontSize: '0.9rem' }}>Activity Log</h4>
              <div className="timeline">
                {activityLogs.map((log: any) => (
                  <div className="timeline-item" key={log.id}>
                    <div className="timeline-content">
                      <strong>{log.user?.displayName || 'System'}</strong> {log.action.toLowerCase().replace('_', ' ')}
                      {log.fieldName && (
                        <div style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {log.fieldName}: {log.oldValue} → {log.newValue}
                        </div>
                      )}
                    </div>
                    <div className="timeline-time">
                      {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

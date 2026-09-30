import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teamsAPI, usersAPI } from '../api/client'
import { Users, Plus, Shield, ShieldAlert, User, MoreVertical } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TeamsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  
  // Form State
  const [teamName, setTeamName] = useState('')
  const [teamDesc, setTeamDesc] = useState('')
  const [newMemberId, setNewMemberId] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('MEMBER')

  const queryClient = useQueryClient()

  // Queries
  const { data: teamsData, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsAPI.list().then(r => r.data),
  })

  const { data: usersData } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => usersAPI.list().then(r => r.data),
  })

  // Mutations
  const createTeam = useMutation({
    mutationFn: (data: { name: string, description?: string }) => teamsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      setIsCreateModalOpen(false)
      setTeamName('')
      setTeamDesc('')
      toast.success('Team created')
    }
  })

  const addMember = useMutation({
    mutationFn: () => teamsAPI.addMember(selectedTeamId!, newMemberId, newMemberRole),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      setIsAddMemberModalOpen(false)
      setNewMemberId('')
      setNewMemberRole('MEMBER')
      toast.success('Member added')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to add member')
    }
  })

  const teams = teamsData?.teams || []
  const allUsers = usersData?.users || []

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Teams</h1>
          <p>Manage your teams and roles</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
          <Plus size={16} /> New Team
        </button>
      </div>

      <div className="page-content">
        {isLoading ? (
          <div className="loading-page" style={{ height: 200 }}>
            <div className="loading-spinner" />
          </div>
        ) : teams.length === 0 ? (
          <div className="empty-state">
            <Users size={48} />
            <h3>No teams yet</h3>
            <p>Create a team to start organizing work.</p>
          </div>
        ) : (
          <div className="grid-2">
            {teams.map((team: any) => (
              <div key={team.id} className="card">
                <div className="card-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
                  <div>
                    <h2 className="card-title" style={{ fontSize: '1.1rem' }}>{team.name}</h2>
                    {team.description && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        {team.description}
                      </p>
                    )}
                  </div>
                  <div className="stat-card" style={{ padding: '8px 12px' }}>
                    <div className="stat-value" style={{ fontSize: '1.2rem' }}>{team._count?.workItems || 0}</div>
                    <div className="stat-label">Items</div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Members ({team.members?.length || 0})</h3>
                  <button 
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setSelectedTeamId(team.id)
                      setIsAddMemberModalOpen(true)
                    }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {team.members?.map((member: any) => (
                    <div key={member.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="user-avatar" style={{ width: 28, height: 28, fontSize: '0.7rem' }}>
                          {member.user.displayName[0]}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{member.user.displayName}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{member.user.email}</div>
                        </div>
                      </div>
                      <div>
                        {member.role === 'ADMIN' && <span className="badge badge-critical" style={{ fontSize: '0.6rem' }}><ShieldAlert size={10} /> Admin</span>}
                        {member.role === 'TEAM_LEAD' && <span className="badge badge-medium" style={{ fontSize: '0.6rem' }}><Shield size={10} /> Lead</span>}
                        {member.role === 'MEMBER' && <span className="badge badge-closed" style={{ fontSize: '0.6rem' }}><User size={10} /> Member</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Team Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsCreateModalOpen(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h2>Create New Team</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setIsCreateModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createTeam.mutate({ name: teamName, description: teamDesc }) }}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Team Name</label>
                  <input
                    className="form-input"
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g. Platform Engineering"
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Description (Optional)</label>
                  <input
                    className="form-input"
                    type="text"
                    value={teamDesc}
                    onChange={(e) => setTeamDesc(e.target.value)}
                    placeholder="What does this team do?"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsCreateModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={createTeam.isPending || !teamName}>
                  {createTeam.isPending ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {isAddMemberModalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsAddMemberModalOpen(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h2>Add Team Member</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setIsAddMemberModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addMember.mutate() }}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">User</label>
                  <select
                    className="form-select"
                    value={newMemberId}
                    onChange={(e) => setNewMemberId(e.target.value)}
                    required
                  >
                    <option value="">Select User...</option>
                    {allUsers.map((u: any) => (
                      <option key={u.id} value={u.id}>{u.displayName} ({u.email})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Role</label>
                  <select
                    className="form-select"
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    required
                  >
                    <option value="MEMBER">Member (Standard access)</option>
                    <option value="TEAM_LEAD">Team Lead (Can assign work, add members)</option>
                    <option value="ADMIN">Admin (Full control over team settings)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsAddMemberModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={addMember.isPending || !newMemberId}>
                  {addMember.isPending ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

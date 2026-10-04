import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle, useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  User,
  LogOut,
  LayoutGrid,
  ClipboardList,
  Bell,
  Scale,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    label: 'Navigation',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
      { key: 'all-complaints', label: 'All Complaints', icon: ClipboardList },
      { key: 'complaints', label: 'My Assigned Complaints', icon: ClipboardList, badgeKey: 'highPriority' },
      { key: 'hearings', label: 'Hearing Details', icon: Scale },
      { key: 'remarks', label: 'Create Complaint Remarks', icon: MessageSquare },
      { key: 'notifications', label: 'Notifications', icon: Bell, badgeKey: 'unreadNotifs' },
    ],
  },
];

export default function TanodDashboard() {
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [complaints, setComplaints] = useState([]);
  const [allComplaints, setAllComplaints] = useState([]);
  const [remarks, setRemarks] = useState({});
  const [hearings, setHearings] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [showRemarkForm, setShowRemarkForm] = useState(null);
  const [activeNav, setActiveNav] = useState('dashboard');
  const [showProfile, setShowProfile] = useState(false);
  const [remarkText, setRemarkText] = useState('');
  const [submittingRemark, setSubmittingRemark] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const goToNav = (key) => {
    setActiveNav(key);
    setShowProfile(false);
  };

  const loadData = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      const [allRes, assignedRes] = await Promise.all([
        api.get('/tanod/complaints'),
        api.get('/tanod/complaints', { params: { authId: user.id, assigned: 'true' } }),
      ]);

      const all = allRes.data?.complaints || [];
      const assignedToMe = assignedRes.data?.complaints || [];

      setAllComplaints(all);
      setComplaints(assignedToMe);

      for (const complaint of assignedToMe) {
        try {
          const [remarksRes, hearingsRes] = await Promise.all([
            api.get(`/tanod/complaints/${complaint.id}/remarks`),
            api.get(`/tanod/hearings/${complaint.id}`),
          ]);
          setRemarks((prev) => ({ ...prev, [complaint.id]: remarksRes.data?.remarks || [] }));
          setHearings((prev) => ({ ...prev, [complaint.id]: hearingsRes.data?.hearings || [] }));
        } catch (err) {
          console.error(`Failed to load data for complaint ${complaint.id}:`, err);
        }
      }

      try {
        const notifRes = await api.get(`/tanod/notifications/${user.profileId || user.dbId || user.id}`);
        setNotifications(notifRes.data?.notifications || []);
      } catch {
        setNotifications([]);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) loadData();
  }, [user]);

  const handleAddRemark = async (complaintId) => {
    if (!remarkText.trim()) return;
    setSubmittingRemark(true);
    try {
      await api.post(`/tanod/complaints/${complaintId}/remarks`, {
        userId: user.profileId || user.dbId || user.id,
        userRole: user.role || 'TANOD',
        remarkText: remarkText,
        actionType: 'FIELD_OBSERVATION',
      });

      const remarksRes = await api.get(`/tanod/complaints/${complaintId}/remarks`);
      setRemarks((prev) => ({ ...prev, [complaintId]: remarksRes.data?.remarks || [] }));
      setRemarkText('');
      setShowRemarkForm(null);
    } catch (err) {
      alert('Failed to add remark');
    } finally {
      setSubmittingRemark(false);
    }
  };

  const handleUpdateStatus = async (complaintId, newStatus) => {
    try {
      await api.put(`/tanod/complaints/${complaintId}/status`, {
        status: newStatus,
        userId: user.profileId || user.dbId || user.id,
      });
      setComplaints((prev) => prev.map((c) => (c.id === complaintId ? { ...c, status: newStatus } : c)));
    } catch (err) {
      alert('Failed to update status');
    }
  };

  const handleViewDetail = async (complaint) => {
    setSelectedComplaint(complaint);
    setActiveNav('detail');
  };

  const handleMarkAsRead = async (notifId) => {
    try {
      await api.put(`/tanod/notifications/${notifId}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, is_read: 1 } : n)));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.put('/tanod/notifications/read-all', { userId: user.profileId || user.dbId || user.id });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'HIGH': return 'bg-red-100 text-red-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'LOW': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ASSIGNED': return 'bg-blue-50 border-blue-200';
      case 'IN PROGRESS': return 'bg-orange-50 border-orange-200';
      case 'RESOLVED': return 'bg-green-50 border-green-200';
      default: return 'bg-slate-50 border-slate-200';
    }
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateTime = (date) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const stats = {
    total: complaints.length,
    allTotal: allComplaints.length,
    highPriority: complaints.filter((c) => c.priority === 'HIGH').length,
    inProgress: complaints.filter((c) => c.status === 'IN PROGRESS').length,
    resolved: complaints.filter((c) => c.status === 'RESOLVED').length,
    unreadNotifs: unreadCount,
  };

  return (
    <div className={`${isDark ? 'dashboard-dark' : ''} min-h-screen bg-slate-50 flex`}>
      <aside className="w-64 shrink-0 bg-[#0b1220] text-slate-300 flex flex-col py-5 px-4">
        <div className="relative mb-6">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="w-full flex items-center gap-3 border border-slate-700 rounded-2xl px-3 py-2.5 hover:border-slate-600 transition"
          >
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{user?.fullName || user?.name || 'Tanod'}</p>
              <p className="text-slate-500 text-[11px] uppercase tracking-wide">{user?.role || 'TANOD'}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition ${showProfile ? 'rotate-180' : ''}`} />
          </button>
          {showProfile && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-200 text-sm font-medium hover:bg-slate-700/50 transition rounded-lg m-2"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="px-2 mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{section.label}</p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.key;
                  const badgeValue = item.badgeKey ? stats[item.badgeKey] : null;
                  return (
                    <button
                      key={item.key}
                      onClick={() => goToNav(item.key)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                        isActive ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {!!badgeValue && badgeValue > 0 && (
                        <span className="bg-orange-500 text-white text-[11px] font-semibold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                          {badgeValue}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <ThemeToggle />
      </aside>

      <div className="flex-1 min-w-0">
        <div className="p-6">
          <div className="max-w-6xl mx-auto">

            {activeNav === 'dashboard' && (
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">Tanod Dashboard</h1>
                  <p className="text-sm text-slate-600">Overview of your assigned cases and activities</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">Assigned Cases</p>
                    <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">High Priority</p>
                    <p className="text-3xl font-bold text-red-600">{stats.highPriority}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">In Progress</p>
                    <p className="text-3xl font-bold text-orange-600">{stats.inProgress}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">Resolved</p>
                    <p className="text-3xl font-bold text-green-600">{stats.resolved}</p>
                  </div>
                </div>

                {complaints.length > 0 && (
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    <h2 className="text-lg font-semibold text-slate-900 p-6 pb-4">Recent Complaints</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left py-3 px-5 font-semibold text-slate-700">Title</th>
                            <th className="text-left py-3 px-5 font-semibold text-slate-700">Priority</th>
                            <th className="text-left py-3 px-5 font-semibold text-slate-700">Status</th>
                            <th className="text-left py-3 px-5 font-semibold text-slate-700">Citizen</th>
                            <th className="text-left py-3 px-5 font-semibold text-slate-700">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {complaints.slice(0, 5).map((complaint) => (
                            <tr key={complaint.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="py-4 px-5 font-medium text-slate-900">{complaint.title || '—'}</td>
                              <td className="py-4 px-5">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getPriorityColor(complaint.priority)}`}>
                                  {complaint.priority}
                                </span>
                              </td>
                              <td className="py-4 px-5">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                  complaint.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                                  complaint.status === 'IN PROGRESS' ? 'bg-orange-100 text-orange-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  {complaint.status}
                                </span>
                              </td>
                              <td className="py-4 px-5 text-slate-600">{complaint.citizen_name || '—'}</td>
                              <td className="py-4 px-5">
                                <button
                                  onClick={() => handleViewDetail(complaint)}
                                  className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                                >
                                  View Details
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeNav === 'all-complaints' && (
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">All Complaints</h1>
                  <p className="text-sm text-slate-600">View all complaints in the system ({allComplaints.length} total)</p>
                </div>

                <div className="space-y-4">
                  {loading ? (
                    <p className="text-slate-600">Loading complaints...</p>
                  ) : allComplaints.length === 0 ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                      <p className="text-slate-600">No complaints found.</p>
                    </div>
                  ) : (
                    allComplaints.map((complaint) => (
                      <div
                        key={complaint.id}
                        className={`bg-white rounded-lg border p-4 shadow-sm transition ${getStatusColor(complaint.status)}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900">{complaint.title}</p>
                              <p className="text-sm text-slate-600">ID: {complaint.complaint_id}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {complaint.assigned_name && (
                              <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">Assigned to: {complaint.assigned_name}</span>
                            )}
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(complaint.priority)}`}>
                              {complaint.priority}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                          <span>Category: <strong>{complaint.category_name || 'N/A'}</strong></span>
                          <span>Status: <strong>{complaint.status}</strong></span>
                          <span>Submitted: <strong>{formatDate(complaint.submitted_at)}</strong></span>
                          <span>Citizen: <strong>{complaint.citizen_name || 'N/A'}</strong></span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {activeNav === 'complaints' && (
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">View Assigned Complaints</h1>
                  <p className="text-sm text-slate-600">Manage your field response and case updates</p>
                </div>

                <div className="space-y-4">
                  {loading ? (
                    <p className="text-slate-600">Loading cases...</p>
                  ) : complaints.length === 0 ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                      <p className="text-slate-600">No assigned cases at this time.</p>
                    </div>
                  ) : (
                    complaints.map((complaint) => (
                      <div
                        key={complaint.id}
                        className={`bg-white rounded-lg border p-4 shadow-sm transition ${getStatusColor(complaint.status)}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-start gap-3 flex-1">
                            <button
                              onClick={() => setExpandedId(expandedId === complaint.id ? null : complaint.id)}
                              className="mt-1 text-slate-600 hover:text-slate-900"
                            >
                              {expandedId === complaint.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </button>
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900">{complaint.title}</p>
                              <p className="text-sm text-slate-600">ID: {complaint.complaint_id}</p>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(complaint.priority)}`}>
                            {complaint.priority}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-slate-600 mb-3">
                          <span>Category: <strong>{complaint.category_name || 'N/A'}</strong></span>
                          <span>Status: <strong>{complaint.status}</strong></span>
                          <span>Submitted: <strong>{formatDate(complaint.submitted_at)}</strong></span>
                          <span>Citizen: <strong>{complaint.citizen_name || 'N/A'}</strong></span>
                        </div>

                        {expandedId === complaint.id && (
                          <div className="border-t border-slate-200 pt-4 mt-4 space-y-4">
                            <div>
                              <p className="font-medium text-slate-900 mb-2">Complaint Details</p>
                              <p className="text-slate-700 text-sm bg-slate-50 p-3 rounded">{complaint.description}</p>
                            </div>

                            <div>
                              <p className="font-medium text-slate-900 mb-2">Update Status</p>
                              <div className="flex gap-2 flex-wrap">
                                {['ASSIGNED', 'IN PROGRESS', 'RESOLVED'].map((status) => (
                                  <button
                                    key={status}
                                    onClick={() => handleUpdateStatus(complaint.id, status)}
                                    className={`px-3 py-1 rounded text-sm transition ${
                                      complaint.status === status
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                    }`}
                                  >
                                    {status}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {hearings[complaint.id] && hearings[complaint.id].length > 0 && (
                              <div>
                                <p className="font-medium text-slate-900 mb-2">Hearings</p>
                                <div className="space-y-2">
                                  {hearings[complaint.id].map((hearing) => (
                                    <div key={hearing.id} className="bg-slate-50 p-3 rounded text-sm">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Scale className="w-4 h-4 text-blue-600" />
                                        <span className="font-medium">{formatDate(hearing.scheduled_date)} at {hearing.scheduled_time || 'TBD'}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                                          hearing.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                                        }`}>{hearing.status}</span>
                                      </div>
                                      <p className="text-slate-600">Location: {hearing.location || 'TBD'}</p>
                                      {hearing.notes && <p className="text-slate-600 mt-1">Notes: {hearing.notes}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div>
                              <p className="font-medium text-slate-900 mb-3">Field Observations & Remarks</p>

                              {remarks[complaint.id] && remarks[complaint.id].length > 0 && (
                                <div className="bg-slate-50 rounded-lg p-3 mb-3 space-y-3 max-h-48 overflow-y-auto">
                                  {remarks[complaint.id].map((remark) => (
                                    <div key={remark.id} className="border-l-4 border-blue-500 pl-3 py-1">
                                      <p className="text-xs font-semibold text-slate-700">{remark.user_name} ({remark.user_role})</p>
                                      <p className="text-sm text-slate-600 mt-1">{remark.remark_text}</p>
                                      <p className="text-xs text-slate-500 mt-1">{formatDateTime(remark.created_at)}</p>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {showRemarkForm === complaint.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={remarkText}
                                    onChange={(e) => setRemarkText(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                                    rows="3"
                                    placeholder="Add your field observation or remark..."
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleAddRemark(complaint.id)}
                                      disabled={submittingRemark}
                                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition disabled:opacity-50"
                                    >
                                      {submittingRemark ? 'Adding...' : 'Add Remark'}
                                    </button>
                                    <button
                                      onClick={() => { setShowRemarkForm(null); setRemarkText(''); }}
                                      className="px-3 py-1 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300 transition"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setShowRemarkForm(complaint.id)}
                                  className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                  <Plus className="w-4 h-4" />
                                  Add Observation
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {activeNav === 'hearings' && (
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-6">Hearing Details</h1>
                {Object.values(hearings).flat().length === 0 ? (
                  <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                    <p className="text-slate-600">No hearing details available for your assigned complaints.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {complaints.map((complaint) => {
                      const complaintHearings = hearings[complaint.id] || [];
                      if (complaintHearings.length === 0) return null;
                      return (
                        <div key={complaint.id} className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                          <h3 className="font-semibold text-slate-900 mb-3">{complaint.title} — {complaint.complaint_id}</h3>
                          <div className="space-y-3">
                            {complaintHearings.map((hearing) => (
                              <div key={hearing.id} className="border border-slate-200 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Scale className="w-4 h-4 text-blue-600" />
                                    <span className="font-medium text-slate-900">{formatDate(hearing.scheduled_date)} at {hearing.scheduled_time || 'TBD'}</span>
                                  </div>
                                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                    hearing.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                                  }`}>{hearing.status}</span>
                                </div>
                                <p className="text-sm text-slate-600">Location: {hearing.location || 'TBD'}</p>
                                {hearing.notes && <p className="text-sm text-slate-600 mt-1">Notes: {hearing.notes}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeNav === 'remarks' && (
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-6">Create Complaint Remarks</h1>
                <p className="text-sm text-slate-600 mb-6">Add field observations and remarks to your assigned complaints.</p>
                <div className="space-y-4">
                  {complaints.map((complaint) => (
                    <div key={complaint.id} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-slate-900">{complaint.title}</p>
                          <p className="text-sm text-slate-600">ID: {complaint.complaint_id}</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getPriorityColor(complaint.priority)}`}>
                          {complaint.priority}
                        </span>
                      </div>
                      {remarks[complaint.id] && remarks[complaint.id].length > 0 && (
                        <div className="bg-slate-50 rounded p-2 mb-3 text-xs text-slate-600">
                          {remarks[complaint.id].length} remark(s) already added
                        </div>
                      )}
                      {showRemarkForm === complaint.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={remarkText}
                            onChange={(e) => setRemarkText(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                            rows="3"
                            placeholder="Add your field observation or remark..."
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAddRemark(complaint.id)}
                              disabled={submittingRemark}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition disabled:opacity-50"
                            >
                              {submittingRemark ? 'Adding...' : 'Add Remark'}
                            </button>
                            <button
                              onClick={() => { setShowRemarkForm(null); setRemarkText(''); }}
                              className="px-3 py-1 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowRemarkForm(complaint.id)}
                          className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Plus className="w-4 h-4" />
                          Add Observation
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeNav === 'notifications' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                    <p className="text-slate-600">No notifications yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => !notif.is_read && handleMarkAsRead(notif.id)}
                        className={`flex items-start gap-3 p-4 rounded-lg border transition cursor-pointer ${
                          notif.is_read ? 'bg-white border-slate-200' : 'bg-blue-50 border-blue-200'
                        }`}
                      >
                        <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-1 ${notif.is_read ? 'text-slate-400' : 'text-blue-600'}`} />
                        <div className="flex-1">
                          <p className={`font-medium ${notif.is_read ? 'text-slate-700' : 'text-slate-900'}`}>{notif.title}</p>
                          <p className="text-sm text-slate-600 mt-1">{notif.message}</p>
                          <p className="text-xs text-slate-500 mt-2">{formatDateTime(notif.created_at)}</p>
                        </div>
                        {!notif.is_read && <span className="w-2.5 h-2.5 bg-blue-600 rounded-full flex-shrink-0 mt-2" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeNav === 'detail' && selectedComplaint && (
              <div>
                <button
                  onClick={() => { setActiveNav('complaints'); setSelectedComplaint(null); }}
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4 text-sm"
                >
                  ← Back to Complaints
                </button>

                <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{selectedComplaint.title}</h2>
                      <p className="text-sm text-slate-500">ID: {selectedComplaint.complaint_id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(selectedComplaint.priority)}`}>
                        {selectedComplaint.priority}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        selectedComplaint.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                        selectedComplaint.status === 'IN PROGRESS' ? 'bg-orange-100 text-orange-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>{selectedComplaint.status}</span>
                    </div>
                  </div>
                  <p className="text-slate-700 mb-4">{selectedComplaint.description}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-slate-500">Citizen</p><p className="font-medium text-slate-900">{selectedComplaint.citizen_name || 'N/A'}</p></div>
                    <div><p className="text-slate-500">Category</p><p className="font-medium text-slate-900">{selectedComplaint.category_name || 'N/A'}</p></div>
                    <div><p className="text-slate-500">Channel</p><p className="font-medium text-slate-900">{selectedComplaint.channel_name || 'N/A'}</p></div>
                    <div><p className="text-slate-500">Submitted</p><p className="font-medium text-slate-900">{formatDate(selectedComplaint.submitted_at)}</p></div>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
                  <h3 className="font-semibold text-slate-900 mb-3">Update Status</h3>
                  <div className="flex gap-2 flex-wrap">
                    {['ASSIGNED', 'IN PROGRESS', 'RESOLVED'].map((status) => (
                      <button
                        key={status}
                        onClick={() => handleUpdateStatus(selectedComplaint.id, status)}
                        className={`px-4 py-2 rounded-lg text-sm transition ${
                          selectedComplaint.status === status ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                {hearings[selectedComplaint.id] && hearings[selectedComplaint.id].length > 0 && (
                  <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
                    <h3 className="font-semibold text-slate-900 mb-3">Hearing Details</h3>
                    <div className="space-y-3">
                      {hearings[selectedComplaint.id].map((hearing) => (
                        <div key={hearing.id} className="border border-slate-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{formatDate(hearing.scheduled_date)} at {hearing.scheduled_time || 'TBD'}</span>
                            <span className={`text-xs px-2.5 py-0.5 rounded-full ${
                              hearing.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                            }`}>{hearing.status}</span>
                          </div>
                          <p className="text-sm text-slate-600">Location: {hearing.location || 'TBD'}</p>
                          {hearing.notes && <p className="text-sm text-slate-600 mt-1">Notes: {hearing.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
                  <h3 className="font-semibold text-slate-900 mb-3">Field Observations & Remarks</h3>
                  {remarks[selectedComplaint.id] && remarks[selectedComplaint.id].length > 0 ? (
                    <div className="space-y-3 mb-4">
                      {remarks[selectedComplaint.id].map((remark) => (
                        <div key={remark.id} className="border-l-4 border-blue-500 pl-3 py-1">
                          <p className="text-xs font-semibold text-slate-700">{remark.user_name} ({remark.user_role})</p>
                          <p className="text-sm text-slate-600 mt-1">{remark.remark_text}</p>
                          <p className="text-xs text-slate-500 mt-1">{formatDateTime(remark.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 mb-4">No remarks yet.</p>
                  )}

                  <div className="space-y-2">
                    <textarea
                      value={remarkText}
                      onChange={(e) => setRemarkText(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                      rows="3"
                      placeholder="Add your field observation or remark..."
                    />
                    <button
                      onClick={() => handleAddRemark(selectedComplaint.id)}
                      disabled={submittingRemark || !remarkText.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {submittingRemark ? 'Adding...' : 'Add Remark'}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

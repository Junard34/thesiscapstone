import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle, useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import {
  ChevronDown,
  ChevronUp,
  User,
  LogOut,
  LayoutGrid,
  FileText,
  Scale,
  Bell,
  Radio,
  AlertCircle,
  Plus,
  MessageSquare,
  BarChart3,
  CheckCircle,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    label: 'Navigation',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
      { key: 'complaints', label: 'Complaints', icon: FileText },
      { key: 'channels', label: 'Document Channels', icon: Radio },
      { key: 'hearings', label: 'Hearing Details', icon: Scale },
      { key: 'remarks', label: 'Create Complaint Remarks', icon: MessageSquare },
      { key: 'reports', label: 'Generate Reports', icon: BarChart3 },
      { key: 'notifications', label: 'Notifications', icon: Bell, badgeKey: 'unreadNotifs' },
    ],
  },
];

export default function OfficialDashboard() {
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [complaints, setComplaints] = useState([]);
  const [channels, setChannels] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [hearings, setHearings] = useState({});
  const [remarks, setRemarks] = useState({});
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState('dashboard');
  const [showProfile, setShowProfile] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [remarkText, setRemarkText] = useState('');
  const [submittingRemark, setSubmittingRemark] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const goToNav = (key) => {
    setActiveNav(key);
    setShowProfile(false);
  };

  const loadData = async () => {
    try {
      setLoading(true);

      const [complaintRes, channelsRes] = await Promise.all([
        api.get('/official/complaints'),
        api.get('/official/channels'),
      ]);

      setComplaints(complaintRes.data?.complaints || []);
      setChannels(channelsRes.data?.channels || []);

      const allComplaints = complaintRes.data?.complaints || [];
      for (const complaint of allComplaints) {
        try {
          const [hearingRes, remarksRes] = await Promise.all([
            api.get(`/official/hearings/${complaint.id}`),
            api.get(`/official/complaints/${complaint.id}/remarks`),
          ]);
          setHearings((prev) => ({ ...prev, [complaint.id]: hearingRes.data?.hearings || [] }));
          setRemarks((prev) => ({ ...prev, [complaint.id]: remarksRes.data?.remarks || [] }));
        } catch (err) {
          console.error(`Failed to load data for complaint ${complaint.id}:`, err);
        }
      }

      try {
        const notifRes = await api.get(`/official/notifications/${user.profileId || user.dbId || user.id}`);
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
    if (user) loadData();
  }, [user]);

  const handleUpdatePriority = async (complaintId, newPriority) => {
    try {
      await api.put(`/official/complaints/${complaintId}`, {
        priority: newPriority,
        userId: user.profileId || user.dbId || user.id,
        userRole: user.role,
      });
      setComplaints((prev) => prev.map((c) => c.id === complaintId ? { ...c, priority: newPriority } : c));
    } catch (err) {
      alert('Failed to update priority');
    }
  };

  const handleViewDetail = async (complaint) => {
    setSelectedComplaint(complaint);
    setActiveNav('detail');
  };

  const handleAddRemark = async (complaintId) => {
    if (!remarkText.trim()) return;
    setSubmittingRemark(true);
    try {
      await api.post(`/official/complaints/${complaintId}/remarks`, {
        userId: user.profileId || user.dbId || user.id,
        userRole: user.role || 'OFFICIAL',
        remarkText,
        actionType: 'UPDATE',
      });
      const remarksRes = await api.get(`/official/complaints/${complaintId}/remarks`);
      setRemarks((prev) => ({ ...prev, [complaintId]: remarksRes.data?.remarks || [] }));
      setRemarkText('');
    } catch (err) {
      alert('Failed to add remark');
    } finally {
      setSubmittingRemark(false);
    }
  };

  const handleMarkAsRead = async (notifId) => {
    try {
      await api.put(`/official/notifications/${notifId}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, is_read: 1 } : n)));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.put('/official/notifications/read-all', { userId: user.profileId || user.dbId || user.id });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleLoadReports = async () => {
    try {
      const res = await api.get('/official/reports');
      setReports(res.data);
    } catch (err) {
      console.error('Failed to load reports:', err);
    }
  };

  const stats = {
    total: complaints.length,
    high: complaints.filter((c) => c.priority === 'HIGH').length,
    medium: complaints.filter((c) => c.priority === 'MEDIUM').length,
    low: complaints.filter((c) => c.priority === 'LOW').length,
    unreadNotifs: notifications.filter((n) => !n.is_read).length,
  };

  const filteredComplaints = complaints.filter((c) => {
    if (filter === 'ALL') return true;
    return c.priority === filter;
  });

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'HIGH': return 'bg-red-100 text-red-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'LOW': return 'bg-green-100 text-green-800';
      default: return 'bg-slate-100 text-slate-800';
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
              <p className="text-white font-semibold text-sm truncate">{user?.fullName || user?.name || 'Official'}</p>
              <p className="text-slate-500 text-[11px] uppercase tracking-wide">{user?.role || 'OFFICIAL'}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition ${showProfile ? 'rotate-180' : ''}`} />
          </button>
          {showProfile && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50">
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-200 text-sm font-medium hover:bg-slate-700/50 transition rounded-lg m-2">
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
          <div className="max-w-7xl mx-auto">

            {activeNav === 'dashboard' && (
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">Official Dashboard</h1>
                  <p className="text-sm text-slate-600">Manage and triage incoming complaints</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">Total Complaints</p>
                    <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">High Priority</p>
                    <p className="text-3xl font-bold text-red-600">{stats.high}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">Medium Priority</p>
                    <p className="text-3xl font-bold text-yellow-600">{stats.medium}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">Low Priority</p>
                    <p className="text-3xl font-bold text-green-600">{stats.low}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">Resolved</p>
                    <p className="text-3xl font-bold text-green-600">{complaints.filter((c) => c.status === 'RESOLVED').length}</p>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6 shadow-sm">
                  <div className="flex gap-2 flex-wrap">
                    {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map((priority) => (
                      <button
                        key={priority}
                        onClick={() => setFilter(priority)}
                        className={`px-4 py-2 rounded-lg transition ${
                          filter === priority ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {priority}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                  <h2 className="text-lg font-semibold text-slate-900 p-6 pb-4">Complaints</h2>
                  {loading ? (
                    <div className="px-6 py-8 text-center"><p className="text-slate-600">Loading complaints...</p></div>
                  ) : filteredComplaints.length === 0 ? (
                    <div className="text-center py-8 px-6">
                      <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-slate-600">No complaints found.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="px-6 py-4 text-left font-semibold text-slate-700">Title</th>
                            <th className="px-6 py-4 text-left font-semibold text-slate-700">Description</th>
                            <th className="px-6 py-4 text-left font-semibold text-slate-700">Channel</th>
                            <th className="px-6 py-4 text-left font-semibold text-slate-700">Status</th>
                            <th className="px-6 py-4 text-left font-semibold text-slate-700">Priority</th>
                            <th className="px-6 py-4 text-left font-semibold text-slate-700">Date</th>
                            <th className="px-6 py-4 text-left font-semibold text-slate-700">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredComplaints.map((complaint, index) => (
                            <tr key={complaint.id} className={`border-b border-slate-200 hover:bg-slate-50 transition ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                              <td className="px-6 py-4">
                                <p className="font-semibold text-slate-900">{complaint.title}</p>
                                <p className="text-xs text-slate-500 mt-1">ID: {complaint.complaint_id}</p>
                              </td>
                              <td className="px-6 py-4"><p className="text-slate-700 line-clamp-2">{complaint.description}</p></td>
                              <td className="px-6 py-4"><p className="text-slate-900">{complaint.channel_name || 'Online form'}</p></td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  complaint.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                                  complaint.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-800' :
                                  'bg-slate-100 text-slate-800'
                                }`}>{complaint.status}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(complaint.priority)}`}>
                                  {complaint.priority}
                                </span>
                              </td>
                              <td className="px-6 py-4"><p className="text-slate-900">{formatDate(complaint.submitted_at)}</p></td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-600">{complaint.assigned_name || 'Unassigned'}</span>
                                  <button
                                    onClick={() => handleViewDetail(complaint)}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                  >
                                    View
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeNav === 'complaints' && (
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">Receive Complaints</h1>
                  <p className="text-sm text-slate-600">View and manage incoming complaints</p>
                </div>

                <div className="space-y-4">
                  {complaints.length === 0 ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                      <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                      <p className="text-slate-600">No complaints found.</p>
                    </div>
                  ) : (
                    complaints.map((complaint) => (
                      <div key={complaint.id} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-slate-900">{complaint.title}</p>
                            <p className="text-sm text-slate-600">ID: {complaint.complaint_id}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(complaint.priority)}`}>
                            {complaint.priority}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 mb-3">{complaint.description}</p>
                        <div className="flex items-center gap-3 text-sm text-slate-600">
                          <span>Status: <strong>{complaint.status}</strong></span>
                          <span>Assigned: <strong>{complaint.assigned_name || 'Unassigned'}</strong></span>
                          <button
                            onClick={() => handleViewDetail(complaint)}
                            className="text-blue-600 hover:text-blue-700 font-medium"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {activeNav === 'channels' && (
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">Document Channels</h1>
                  <p className="text-sm text-slate-600">Channels used to communicate with complainants</p>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Channel</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Description</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Complaints</th>
                        </tr>
                      </thead>
                      <tbody>
                        {channels.map((ch) => (
                          <tr key={ch.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-4 px-5 font-medium text-slate-900">{ch.name}</td>
                            <td className="py-4 px-5 text-slate-600">{ch.description || '—'}</td>
                            <td className="py-4 px-5 text-slate-600">{ch.complaint_count || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {activeNav === 'hearings' && (
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-6">Hearing Details</h1>
                {Object.values(hearings).flat().length === 0 ? (
                  <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                    <p className="text-slate-600">No hearing details available.</p>
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
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeNav === 'remarks' && (
              <div>
                <h1 className="text-2xl font-bold text-slate-900 mb-6">Create Complaint Remarks</h1>
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
                      <div className="space-y-2">
                        <textarea
                          value={expandedId === complaint.id ? remarkText : ''}
                          onChange={(e) => { setExpandedId(complaint.id); setRemarkText(e.target.value); }}
                          onFocus={() => setExpandedId(complaint.id)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                          rows="2"
                          placeholder="Add a remark..."
                        />
                        {expandedId === complaint.id && (
                          <button
                            onClick={() => handleAddRemark(complaint.id)}
                            disabled={submittingRemark || !remarkText.trim()}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition disabled:opacity-50"
                          >
                            {submittingRemark ? 'Adding...' : 'Add Remark'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeNav === 'reports' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">Generate Reports</h1>
                    <p className="text-sm text-slate-600">Overview of complaint data and statistics</p>
                  </div>
                  <button
                    onClick={handleLoadReports}
                    className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800"
                  >
                    Generate Report
                  </button>
                </div>

                {reports ? (
                  <div className="space-y-6">
                    <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                      <h3 className="font-semibold text-slate-900 mb-4">Total Complaints: {reports.totalComplaints}</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                        <h4 className="font-semibold text-slate-900 mb-3">By Status</h4>
                        {reports.byStatus.map((item) => (
                          <div key={item.status} className="flex justify-between text-sm py-1">
                            <span className="text-slate-600">{item.status || 'Unknown'}</span>
                            <span className="font-medium text-slate-900">{item.count}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                        <h4 className="font-semibold text-slate-900 mb-3">By Priority</h4>
                        {reports.byPriority.map((item) => (
                          <div key={item.priority} className="flex justify-between text-sm py-1">
                            <span className="text-slate-600">{item.priority || 'Unknown'}</span>
                            <span className="font-medium text-slate-900">{item.count}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                        <h4 className="font-semibold text-slate-900 mb-3">By Category</h4>
                        {reports.byCategory.map((item) => (
                          <div key={item.category} className="flex justify-between text-sm py-1">
                            <span className="text-slate-600">{item.category || 'Unknown'}</span>
                            <span className="font-medium text-slate-900">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                      <h4 className="font-semibold text-slate-900 mb-3">By Channel</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {reports.byChannel.map((item) => (
                          <div key={item.channel} className="bg-slate-50 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-slate-900">{item.count}</p>
                            <p className="text-sm text-slate-600">{item.channel || 'Unknown'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-slate-200 p-8 text-center shadow-sm">
                    <BarChart3 className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                    <p className="text-slate-600">Click "Generate Report" to view complaint statistics.</p>
                  </div>
                )}
              </div>
            )}

            {activeNav === 'notifications' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
                  {stats.unreadNotifs > 0 && (
                    <button onClick={handleMarkAllAsRead} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
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
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(selectedComplaint.priority)}`}>{selectedComplaint.priority}</span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">{selectedComplaint.status}</span>
                    </div>
                  </div>
                  <p className="text-slate-700 mb-4">{selectedComplaint.description}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-slate-500">Citizen</p><p className="font-medium text-slate-900">{selectedComplaint.citizen_name || 'N/A'}</p></div>
                    <div><p className="text-slate-500">Channel</p><p className="font-medium text-slate-900">{selectedComplaint.channel_name || 'N/A'}</p></div>
                    <div><p className="text-slate-500">Assigned To</p><p className="font-medium text-slate-900">{selectedComplaint.assigned_name || 'Unassigned'}</p></div>
                    <div><p className="text-slate-500">Submitted</p><p className="font-medium text-slate-900">{formatDate(selectedComplaint.submitted_at)}</p></div>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
                  <h3 className="font-semibold text-slate-900 mb-3">Remarks</h3>
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
                      placeholder="Add a remark..."
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

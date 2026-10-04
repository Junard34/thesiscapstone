import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle, useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Calendar,
  User,
  LogOut,
  LayoutGrid,
  Scale,
  Bell,
  FileText,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    label: 'Navigation',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
      { key: 'all-complaints', label: 'All Complaints', icon: FileText },
      { key: 'assigned-complaints', label: 'My Assigned Complaints', icon: FileText },
      { key: 'manage-hearing', label: 'Manage Hearing', icon: Scale },
      { key: 'schedule-hearing', label: 'Create Schedule Hearing', icon: Calendar },
      { key: 'remarks', label: 'Create Complaint Remarks', icon: MessageSquare },
      { key: 'notifications', label: 'Notification', icon: Bell, badgeKey: 'unreadNotifs' },
    ],
  },
];

export default function LuponDashboard() {
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [complaints, setComplaints] = useState([]);
  const [allComplaints, setAllComplaints] = useState([]);
  const [hearings, setHearings] = useState({});
  const [remarks, setRemarks] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState('dashboard');
  const [showProfile, setShowProfile] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [showHearingForm, setShowHearingForm] = useState(null);
  const [remarkText, setRemarkText] = useState({});
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const goToNav = (key) => {
    setActiveNav(key);
    setShowProfile(false);
  };

  const [hearingData, setHearingData] = useState({
    scheduledDate: '',
    scheduledTime: '',
    location: '',
    notes: '',
  });
  const [submittingHearing, setSubmittingHearing] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [allRes, assignedRes] = await Promise.all([
          api.get('/lupon/complaints'),
          api.get('/lupon/complaints', { params: { authId: user?.id, assigned: 'true' } }),
        ]);

        const all = allRes.data.complaints || [];
        const assignedToMe = assignedRes.data.complaints || [];

        setAllComplaints(all);
        setComplaints(assignedToMe);

        const remarksMap = {};
        const hearingsMap = {};

        for (const complaint of assignedToMe) {
          try {
            const hearingsRes = await api.get(`/lupon/complaints/${complaint.id}/hearings`);
            hearingsMap[complaint.id] = hearingsRes.data.hearings || [];

            const remarksRes = await api.get(`/lupon/complaints/${complaint.id}/remarks`);
            remarksMap[complaint.id] = remarksRes.data.remarks || [];
          } catch (err) {
            console.error(`Failed to load complaint details for ${complaint.id}:`, err);
          }
        }

        setHearings(hearingsMap);
        setRemarks(remarksMap);

        const notifRes = await api.get(`/lupon/notifications/${user?.profileId || user?.id}`);
        setNotifications(notifRes.data.notifications || []);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      loadData();
    }
  }, [user]);

  const handleCreateHearing = async (complaintId) => {
    if (!hearingData.scheduledDate || !hearingData.scheduledTime) {
      alert('Please fill in date and time');
      return;
    }

    setSubmittingHearing(true);
    try {
      await api.post(`/lupon/complaints/${complaintId}/hearings`, {
        ...hearingData,
        userId: user.profileId || user.dbId || user.id,
        userRole: user.role,
      });

      const hearingsRes = await api.get(`/lupon/complaints/${complaintId}/hearings`);
      setHearings((prev) => ({
        ...prev,
        [complaintId]: hearingsRes.data.hearings || [],
      }));

      setHearingData({
        scheduledDate: '',
        scheduledTime: '',
        location: '',
        notes: '',
      });
      setShowHearingForm(null);
    } catch (err) {
      alert('Failed to create hearing');
    } finally {
      setSubmittingHearing(false);
    }
  };

  const handleUpdateHearing = async (complaintId, hearingId, updates) => {
    try {
      await api.put(`/lupon/complaints/${complaintId}/hearings/${hearingId}`, {
        ...updates,
        userId: user.profileId || user.dbId || user.id,
        userRole: user.role,
      });

      const hearingsRes = await api.get(`/lupon/complaints/${complaintId}/hearings`);
      setHearings((prev) => ({
        ...prev,
        [complaintId]: hearingsRes.data.hearings || [],
      }));

      if (updates.result) {
        const updatedComplaints = complaints.map((c) =>
          c.id === complaintId ? { ...c, status: 'RESOLVED', resolution: updates.result } : c
        );
        setComplaints(updatedComplaints);
      }
    } catch (err) {
      alert('Failed to update hearing');
    }
  };

  const handleAddRemark = async (complaintId) => {
    const text = (remarkText[complaintId] || '').trim();
    if (!text) return;

    try {
      await api.post(`/lupon/complaints/${complaintId}/remarks`, {
        userId: user.profileId || user.dbId || user.id,
        userRole: user.role,
        remarkText: text,
        actionType: 'UPDATE',
      });

      const remarksRes = await api.get(`/lupon/complaints/${complaintId}/remarks`);
      setRemarks((prev) => ({
        ...prev,
        [complaintId]: remarksRes.data.remarks || [],
      }));
      setRemarkText((prev) => ({ ...prev, [complaintId]: '' }));
    } catch (err) {
      alert('Failed to add remark');
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'HIGH':
        return 'bg-red-100 text-red-800';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800';
      case 'LOW':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'FOR HEARING / MEDIATION':
        return 'bg-indigo-50 border-indigo-200';
      case 'RESOLVED':
        return 'bg-green-50 border-green-200';
      default:
        return 'bg-slate-50 border-slate-200';
    }
  };

  const stats = {
    total: complaints.length,
    withHearings: complaints.filter((c) => hearings[c.id]?.length > 0).length,
    resolved: complaints.filter((c) => c.status === 'RESOLVED').length,
    unreadNotifs: notifications.filter((n) => !n.is_read).length,
  };

  const handleMarkAsRead = async (notifId) => {
    try {
      await api.put(`/lupon/notifications/${notifId}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, is_read: 1 } : n)));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.put('/lupon/notifications/read-all', { userId: user.profileId || user.dbId || user.id });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
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
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-[#0b1220] text-slate-300 flex flex-col py-5 px-4">
        {/* Profile pill */}
        <div className="relative mb-6">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="w-full flex items-center gap-3 border border-slate-700 rounded-2xl px-3 py-2.5 hover:border-slate-600 transition"
          >
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{user?.fullName}</p>
              <p className="text-slate-500 text-[11px] uppercase tracking-wide">{user?.role}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition ${showProfile ? 'rotate-180' : ''}`} />
          </button>

          {/* Profile dropdown menu */}
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
              <p className="px-2 mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                {section.label}
              </p>
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
                        isActive
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
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

      {/* Main column */}
      <div className="flex-1 min-w-0">
        <div className="p-6">
          <div className="max-w-6xl mx-auto">

            {activeNav === 'dashboard' && (
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">Lupon Dashboard</h1>
                  <p className="text-sm text-slate-600">Manage mediation, hearings, and case resolution</p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">Assigned Cases</p>
                    <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">With Hearings</p>
                    <p className="text-3xl font-bold text-blue-600">{stats.withHearings}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">Resolved</p>
                    <p className="text-3xl font-bold text-green-600">{stats.resolved}</p>
                  </div>
                </div>

                {/* Cases List */}
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
                              <p className="text-sm text-slate-600">ID: {complaint.complaint_id} | Citizen: {complaint.citizen_name}</p>
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
                        </div>

                        {expandedId === complaint.id && (
                          <div className="border-t border-slate-200 pt-4 mt-4 space-y-4">
                            <div>
                              <p className="font-medium text-slate-900 mb-2">Complaint Details</p>
                              <p className="text-slate-700 text-sm bg-slate-50 p-3 rounded">{complaint.description}</p>
                            </div>

                            {/* Hearings Section */}
                            <div>
                              <div className="flex items-center justify-between mb-3">
                                <p className="font-medium text-slate-900 flex items-center gap-2">
                                  <Calendar className="w-5 h-5" />
                                  Hearings
                                </p>
                                {showHearingForm !== complaint.id && (
                                  <button
                                    onClick={() => setShowHearingForm(complaint.id)}
                                    className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                  >
                                    <Plus className="w-4 h-4" />
                                    Schedule Hearing
                                  </button>
                                )}
                              </div>

                              {/* Existing Hearings */}
                              {hearings[complaint.id] && hearings[complaint.id].length > 0 && (
                                <div className="bg-slate-50 rounded-lg p-3 mb-3 space-y-3">
                                  {hearings[complaint.id].map((hearing) => (
                                    <div key={hearing.id} className="border border-slate-200 rounded p-3 bg-white">
                                      <div className="flex justify-between items-start mb-2">
                                        <div>
                                          <p className="font-semibold text-slate-900">
                                            {hearing.scheduled_date} at {hearing.scheduled_time}
                                          </p>
                                          <p className="text-sm text-slate-600">{hearing.location}</p>
                                        </div>
                                        <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                          {hearing.status}
                                        </span>
                                      </div>
                                      {hearing.notes && <p className="text-sm text-slate-700 mb-2">{hearing.notes}</p>}

                                      {hearing.status === 'SCHEDULED' && (
                                        <div className="space-y-2">
                                          <div>
                                            <label className="text-xs font-medium text-slate-700">Hearing Result</label>
                                            <textarea
                                              placeholder="Record settlement or resolution..."
                                              className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:border-blue-500 focus:outline-none mt-1"
                                              rows="2"
                                              id={`hearing-result-${hearing.id}`}
                                            />
                                          </div>
                                          <button
                                            onClick={() => {
                                              const result = document.getElementById(`hearing-result-${hearing.id}`).value;
                                              handleUpdateHearing(complaint.id, hearing.id, {
                                                status: 'COMPLETED',
                                                result,
                                              });
                                            }}
                                            className="text-xs font-medium bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition"
                                          >
                                            Mark Complete & Resolve
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Add Hearing Form */}
                              {showHearingForm === complaint.id && (
                                <div className="border border-slate-300 rounded-lg p-4 bg-slate-50 space-y-3">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                                      <input
                                        type="date"
                                        value={hearingData.scheduledDate}
                                        onChange={(e) => setHearingData({ ...hearingData, scheduledDate: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
                                      <input
                                        type="time"
                                        value={hearingData.scheduledTime}
                                        onChange={(e) => setHearingData({ ...hearingData, scheduledTime: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                                    <input
                                      type="text"
                                      value={hearingData.location}
                                      onChange={(e) => setHearingData({ ...hearingData, location: e.target.value })}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                                      placeholder="e.g., Barangay Hall, Room 201"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                                    <textarea
                                      value={hearingData.notes}
                                      onChange={(e) => setHearingData({ ...hearingData, notes: e.target.value })}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                                      rows="2"
                                      placeholder="Additional information..."
                                    />
                                  </div>

                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleCreateHearing(complaint.id)}
                                      disabled={submittingHearing}
                                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition disabled:opacity-50"
                                    >
                                      {submittingHearing ? 'Scheduling...' : 'Schedule Hearing'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setShowHearingForm(null);
                                        setHearingData({
                                          scheduledDate: '',
                                          scheduledTime: '',
                                          location: '',
                                          notes: '',
                                        });
                                      }}
                                      className="flex-1 px-3 py-2 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300 transition"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Resolution */}
                            {complaint.resolution && (
                              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <p className="font-medium text-slate-900 mb-2">Resolution</p>
                                <p className="text-sm text-slate-700">{complaint.resolution}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {activeNav === 'all-complaints' && (
              <div>
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
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{complaint.title}</p>
                            <p className="text-sm text-slate-600">ID: {complaint.complaint_id}</p>
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
              </div>
            )}

            {activeNav === 'assigned-complaints' && (
              <div>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">View Assigned Complaints</h1>
                  <p className="text-sm text-slate-600">Review and manage complaints assigned to the Lupon.</p>
                </div>
                <div className="space-y-4">
                  {loading ? (
                    <p className="text-slate-600">Loading assigned complaints...</p>
                  ) : complaints.length === 0 ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                      <p className="text-slate-600">No assigned complaints at this time.</p>
                    </div>
                  ) : (
                    complaints.map((complaint) => (
                      <div key={complaint.id} className={`bg-white rounded-lg border p-4 shadow-sm ${getStatusColor(complaint.status)}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{complaint.title}</p>
                            <p className="text-sm text-slate-600">ID: {complaint.complaint_id}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(complaint.priority)}`}>
                            {complaint.priority}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 mb-3">{complaint.description}</p>
                        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                          <span>Status: <strong>{complaint.status}</strong></span>
                          <span>Submitted: <strong>{formatDate(complaint.submitted_at)}</strong></span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeNav === 'manage-hearing' && (
              <div>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">Manage Hearing</h1>
                  <p className="text-sm text-slate-600">View scheduled hearings and mark them as completed with results.</p>
                </div>
                <div className="space-y-4">
                  {complaints.filter((c) => (hearings[c.id] || []).length > 0).length === 0 ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                      <Scale className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="font-medium text-slate-700">No hearings scheduled yet</p>
                      <p className="text-sm text-slate-500 mt-1">Use "Create Schedule Hearing" to schedule hearings for your complaints.</p>
                    </div>
                  ) : (
                    complaints.filter((c) => (hearings[c.id] || []).length > 0).map((complaint) => (
                      <div key={complaint.id} className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <p className="font-semibold text-slate-900">{complaint.title}</p>
                            <p className="text-sm text-slate-600">{complaint.complaint_id} | Citizen: {complaint.citizen_name || 'N/A'}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(complaint.priority)}`}>
                            {complaint.priority}
                          </span>
                        </div>
                        <div className="space-y-3">
                          {(hearings[complaint.id] || []).map((hearing) => (
                            <div key={hearing.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                              <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4 text-blue-600" />
                                  <p className="font-medium text-slate-900">{hearing.scheduled_date} at {hearing.scheduled_time}</p>
                                </div>
                                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                  hearing.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                                }`}>{hearing.status}</span>
                              </div>
                              <p className="text-sm text-slate-600">Location: {hearing.location || 'Not specified'}</p>
                              {hearing.notes && <p className="mt-1 text-sm text-slate-700">Notes: {hearing.notes}</p>}

                              {hearing.status === 'SCHEDULED' && (
                                <div className="mt-3 border-t border-slate-200 pt-3 space-y-2">
                                  <p className="text-sm font-medium text-slate-900">Record Hearing Result</p>
                                  <textarea
                                    placeholder="Record the settlement, resolution, or outcome of the hearing..."
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
                                    rows="3"
                                    id={`hearing-result-${hearing.id}`}
                                  />
                                  <button
                                    onClick={() => {
                                      const result = document.getElementById(`hearing-result-${hearing.id}`).value;
                                      handleUpdateHearing(complaint.id, hearing.id, {
                                        status: 'COMPLETED',
                                        result,
                                      });
                                    }}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
                                  >
                                    Mark Complete & Resolve
                                  </button>
                                </div>
                              )}

                              {hearing.status === 'COMPLETED' && (
                                <div className="mt-3 border-t border-slate-200 pt-3">
                                  <p className="text-sm font-medium text-green-700">Completed</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeNav === 'schedule-hearing' && (
              <div>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">Create Schedule Hearing</h1>
                  <p className="text-sm text-slate-600">Schedule a mediation or hearing for an assigned complaint. The citizen will be notified automatically.</p>
                </div>
                <div className="space-y-4">
                  {complaints.length === 0 ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                      <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="font-medium text-slate-700">No assigned complaints</p>
                      <p className="text-sm text-slate-500 mt-1">You need assigned complaints before scheduling hearings.</p>
                    </div>
                  ) : (
                    complaints.map((complaint) => (
                      <div key={complaint.id} className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
                        <div className="mb-4">
                          <p className="font-semibold text-slate-900">{complaint.title}</p>
                          <p className="text-sm text-slate-600">ID: {complaint.complaint_id} | Citizen: {complaint.citizen_name || 'N/A'}</p>
                          <p className="text-sm text-slate-500 mt-1 line-clamp-1">{complaint.description}</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Hearing Date *</label>
                            <input
                              type="date"
                              value={hearingData.scheduledDate}
                              onChange={(e) => setHearingData({ ...hearingData, scheduledDate: e.target.value })}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Hearing Time *</label>
                            <input
                              type="time"
                              value={hearingData.scheduledTime}
                              onChange={(e) => setHearingData({ ...hearingData, scheduledTime: e.target.value })}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                            />
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                          <input
                            type="text"
                            value={hearingData.location}
                            onChange={(e) => setHearingData({ ...hearingData, location: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                            placeholder="e.g., Barangay Hall, Room 201"
                          />
                        </div>
                        <div className="mt-3">
                          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                          <textarea
                            value={hearingData.notes}
                            onChange={(e) => setHearingData({ ...hearingData, notes: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                            rows="2"
                            placeholder="Purpose of hearing, things to bring, etc."
                          />
                        </div>
                        <button
                          onClick={() => handleCreateHearing(complaint.id)}
                          disabled={submittingHearing}
                          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          {submittingHearing ? 'Scheduling...' : 'Schedule Hearing'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeNav === 'remarks' && (
              <div>
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-slate-900">Create Complaint Remarks</h1>
                  <p className="text-sm text-slate-600">Record hearing results, observations, mediation notes, and actions taken for each complaint.</p>
                </div>
                <div className="space-y-4">
                  {complaints.length === 0 ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                      <MessageSquare className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="font-medium text-slate-700">No assigned complaints</p>
                      <p className="text-sm text-slate-500 mt-1">You need assigned complaints before adding remarks.</p>
                    </div>
                  ) : (
                    complaints.map((complaint) => (
                      <div key={complaint.id} className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <p className="font-semibold text-slate-900">{complaint.title}</p>
                            <p className="text-sm text-slate-600">ID: {complaint.complaint_id} | Citizen: {complaint.citizen_name || 'N/A'}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(complaint.priority)}`}>
                            {complaint.priority}
                          </span>
                        </div>

                        <textarea
                          value={remarkText[complaint.id] || ''}
                          onChange={(e) => setRemarkText((prev) => ({ ...prev, [complaint.id]: e.target.value }))}
                          rows="3"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                          placeholder="e.g., Mediation conducted, parties agreed to settle, follow-up needed..."
                        />
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => handleAddRemark(complaint.id)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                          >
                            Save Remark
                          </button>
                        </div>

                        {(remarks[complaint.id] || []).length > 0 && (
                          <div className="mt-4 space-y-2">
                            <p className="font-medium text-slate-900 text-sm">Previous Remarks ({remarks[complaint.id].length})</p>
                            {(remarks[complaint.id] || []).map((remark) => (
                              <div key={remark.id} className="border-l-4 border-blue-500 pl-3 py-2 bg-slate-50 rounded-r">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-semibold text-slate-700">{remark.user_name || 'Unknown'}</span>
                                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{remark.user_role}</span>
                                  <span className="text-xs text-slate-500">{formatDateTime(remark.created_at)}</span>
                                </div>
                                <p className="text-sm text-slate-700">{remark.remark_text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeNav === 'notifications' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">Notification</h1>
                    <p className="text-sm text-slate-600">Latest updates and alerts for your assigned cases.</p>
                  </div>
                  {stats.unreadNotifs > 0 && (
                    <button onClick={handleMarkAllAsRead} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {notifications.length === 0 ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                      <p className="text-slate-600">No notifications at this time.</p>
                    </div>
                  ) : (
                    notifications.map((notif) => (
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
                    ))
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
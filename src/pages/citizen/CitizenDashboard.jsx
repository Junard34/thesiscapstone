
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle, useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Plus,
  LayoutDashboard,
  Calendar,
  Bell,
  User,
  LogOut,
  ChevronDown,
  Trash2,
  Star,
  Eye,
  ArrowLeft,
  MessageSquare,
} from 'lucide-react';

export default function CitizenDashboard() {
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [complaints, setComplaints] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [activeView, setActiveView] = useState('dashboard');
  const [hearings, setHearings] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [complaintRemarks, setComplaintRemarks] = useState([]);
  const [complaintRatings, setComplaintRatings] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [ratingValue, setRatingValue] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSuccess, setRatingSuccess] = useState('');
  const [ratingError, setRatingError] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    channel: 'Online form',
  });

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const loadData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const categoriesRes = await api.get('/citizen/categories');
      setCategories(categoriesRes.data?.categories || []);

      const complaintRes = await api.get('/citizen/complaints', {
        params: { authId: user.id },
      });
      const allComplaints = complaintRes.data?.complaints || [];
      setComplaints(allComplaints);

      let allHearings = [];
      for (const complaint of allComplaints) {
        try {
          const hearingRes = await api.get(`/citizen/hearings/${complaint.id}`);
          allHearings = [...allHearings, ...(hearingRes.data?.hearings || [])];
        } catch (error) {
          console.error(`Failed to load hearings for complaint ${complaint.id}:`, error);
        }
      }
      setHearings(allHearings);

      try {
        const notifRes = await api.get(`/citizen/notifications/${user.profileId || user.dbId || user.id}`);
        setNotifications(notifRes.data?.notifications || []);
      } catch {
        setNotifications([]);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleSubmitComplaint = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitLoading(true);

    try {
      if (!user?.id) {
        throw new Error('You must be logged in to submit a complaint.');
      }
      if (!formData.title) {
        throw new Error('Please select a complaint category.');
      }
      if (!formData.description.trim()) {
        throw new Error('Please provide a description of your complaint.');
      }

      const response = await api.post('/citizen/complaints', {
        authId: user.id,
        title: formData.title,
        description: formData.description.trim(),
        channel: formData.channel,
      });

      const newComplaint = response.data?.complaint;
      if (newComplaint) {
        setComplaints((prev) => [newComplaint, ...prev]);
      }

      setFormData({ title: '', description: '', channel: 'Online form' });
      setFormSuccess('Complaint submitted successfully! We will review it shortly.');
      setActiveView('dashboard');
      setTimeout(() => setFormSuccess(''), 3000);
    } catch (error) {
      setFormError(error.response?.data?.message || error.message || 'Failed to submit complaint.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteComplaint = async (complaintId) => {
    if (!window.confirm('Are you sure you want to remove this complaint?')) return;

    try {
      setFormError('');
      setFormSuccess('');
      await api.delete(`/citizen/complaints/${complaintId}`);
      setComplaints((prev) => prev.filter((c) => c.id !== complaintId));
      setFormSuccess('Complaint removed successfully.');
      setTimeout(() => setFormSuccess(''), 3000);
    } catch (error) {
      setFormError(error.response?.data?.message || 'Failed to delete complaint.');
    }
  };

  const handleViewDetail = async (complaint) => {
    setLoadingDetail(true);
    setSelectedComplaint(complaint);
    setActiveView('detail');

    try {
      const [remarksRes, ratingsRes, hearingsRes] = await Promise.all([
        api.get(`/citizen/complaints/${complaint.id}/remarks`),
        api.get(`/citizen/complaints/${complaint.id}/ratings`),
        api.get(`/citizen/hearings/${complaint.id}`),
      ]);
      setComplaintRemarks(remarksRes.data?.remarks || []);
      setComplaintRatings(ratingsRes.data?.ratings || []);
      setHearings(hearingsRes.data?.hearings || []);
      setRatingValue(0);
      setRatingFeedback('');
      setRatingSuccess('');
      setRatingError('');
    } catch (error) {
      console.error('Failed to load complaint details:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!ratingValue) {
      setRatingError('Please select a rating.');
      return;
    }
    setSubmittingRating(true);
    setRatingError('');
    setRatingSuccess('');

    try {
      const userId = user.profileId || user.dbId || user.id;
      await api.post(`/citizen/complaints/${selectedComplaint.id}/rate`, {
        userId,
        rating: ratingValue,
        feedback: ratingFeedback,
      });
      setRatingSuccess('Thank you for your feedback!');
      const ratingsRes = await api.get(`/citizen/complaints/${selectedComplaint.id}/ratings`);
      setComplaintRatings(ratingsRes.data?.ratings || []);
      setRatingValue(0);
      setRatingFeedback('');
    } catch (error) {
      setRatingError(error.response?.data?.message || 'Failed to submit rating.');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleMarkAsRead = async (notifId) => {
    try {
      await api.put(`/citizen/notifications/${notifId}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: 1 } : n))
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const userId = user.profileId || user.dbId || user.id;
      await api.put('/citizen/notifications/read-all', { userId });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const getPriorityColor = (priority) => {
    switch (String(priority || '').toUpperCase()) {
      case 'HIGH': return 'bg-red-100 text-red-800';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800';
      case 'LOW': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (String(status || '').toUpperCase()) {
      case 'SUBMITTED': return <AlertCircle className="w-5 h-5 text-blue-500" />;
      case 'RESOLVED':
      case 'CLOSED': return <CheckCircle className="w-5 h-5 text-green-500" />;
      default: return <Clock className="w-5 h-5 text-orange-500" />;
    }
  };

  const stats = {
    total: complaints.length,
    pending: complaints.filter((c) =>
      ['SUBMITTED', 'UNDER REVIEW', 'TRIAGED'].includes(String(c.status || '').toUpperCase())
    ).length,
    inProgress: complaints.filter((c) =>
      ['ASSIGNED', 'IN PROGRESS', 'FOR HEARING / MEDIATION'].includes(String(c.status || '').toUpperCase())
    ).length,
    resolved: complaints.filter((c) =>
      ['RESOLVED', 'CLOSED'].includes(String(c.status || '').toUpperCase())
    ).length,
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) return 'N/A';
    return parsedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateTime = (date) => {
    if (!date) return 'N/A';
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) return 'N/A';
    return parsedDate.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const displayName = user?.name || user?.full_name || user?.fullName || 'Citizen';

  return (
    <div className={`${isDark ? 'dashboard-dark' : ''} min-h-screen bg-slate-50 flex`}>

      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-white p-6 fixed h-screen overflow-y-auto flex flex-col">
        <div className="mb-8 pb-6 border-b border-slate-700">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
            >
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium truncate">{displayName}</p>
                <p className="text-xs text-slate-400">{user?.role || 'CITIZEN'}</p>
              </div>
              <ChevronDown className="w-4 h-4 flex-shrink-0" />
            </button>

            {showProfileDropdown && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 rounded-lg shadow-lg z-50">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-3 hover:bg-red-600 transition text-sm flex items-center gap-2 border-t border-slate-700"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1">
          <div className="mb-8">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Overview</h2>

            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-3 transition ${
                activeView === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-sm">Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('complaints')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-3 transition relative ${
                activeView === 'complaints' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span className="text-sm">Complaints Status</span>
              <span className="ml-auto bg-orange-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                {complaints.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('hearings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                activeView === 'hearings' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Calendar className="w-5 h-5" />
              <span className="text-sm">Hearing Details</span>
            </button>
          </div>

          <div className="mb-8">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Manage</h2>

            <button
              type="button"
              onClick={() => setActiveView('submit')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-3 transition ${
                activeView === 'submit' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Plus className="w-5 h-5" />
              <span className="text-sm">Submit Complaint</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('notifications')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-3 transition ${
                activeView === 'notifications' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Bell className="w-5 h-5" />
              <span className="text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('ratings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                activeView === 'ratings' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Star className="w-5 h-5" />
              <span className="text-sm">Rate Services</span>
            </button>
          </div>
        </div>
        <ThemeToggle />
      </aside>

      {/* MAIN CONTENT */}
      <main className="ml-64 flex-1 p-6">
        <div className="max-w-6xl mx-auto">

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Complaint Dashboard</h1>
            <p className="text-slate-600 mt-1">Welcome, {displayName}</p>
          </div>

          {formSuccess && (
            <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">{formSuccess}</div>
          )}
          {formError && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">{formError}</div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin mb-4" />
              <p className="text-slate-600">Loading your dashboard...</p>
            </div>
          ) : (
            <>

              {/* DASHBOARD VIEW */}
              {activeView === 'dashboard' && (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                      <p className="text-sm text-slate-600">Total Complaints</p>
                      <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                      <p className="text-sm text-slate-600">Pending</p>
                      <p className="text-3xl font-bold text-blue-600">{stats.pending}</p>
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

                  {notifications.length > 0 && (
                    <div className="bg-white rounded-lg border border-slate-200 p-6 mb-8 shadow-sm">
                      <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Notifications</h2>
                      <div className="space-y-3">
                        {notifications.slice(0, 5).map((notif) => (
                          <div key={notif.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                            <div>
                              <p className="font-medium text-slate-900">{notif.title}</p>
                              <p className="text-sm text-slate-600">{notif.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                    <h2 className="text-lg font-semibold text-slate-900 p-6 pb-4">Your Complaints</h2>
                    {complaints.length === 0 ? (
                      <div className="text-center py-8 px-6">
                        <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                        <p className="text-slate-600">No complaints submitted yet.</p>
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
                            {complaints.map((complaint, index) => (
                              <tr key={complaint.id} className={`border-b border-slate-200 hover:bg-slate-50 transition ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                                <td className="px-6 py-4">
                                  <p className="font-semibold text-slate-900">{complaint.title}</p>
                                  <p className="text-xs text-slate-500 mt-1">ID: {complaint.complaint_id || complaint.id}</p>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-slate-700 line-clamp-2">{complaint.description}</p>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-slate-900">{complaint.channel_name || 'Online form'}</p>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {complaint.status || 'SUBMITTED'}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(complaint.priority)}`}>
                                    {complaint.priority || 'LOW'}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-slate-900">{formatDate(complaint.submitted_at)}</p>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleViewDetail(complaint)}
                                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteComplaint(complaint.id)}
                                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      Remove
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
                </div>
              )}

              {/* COMPLAINTS STATUS */}
              {activeView === 'complaints' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900 mb-6">Complaints Status</h2>
                  {complaints.length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-slate-600">No complaints submitted yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {complaints.map((complaint) => (
                        <div key={complaint.id} className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-start gap-3 flex-1">
                              {getStatusIcon(complaint.status)}
                              <div>
                                <p className="font-semibold text-slate-900">{complaint.title}</p>
                                <p className="text-sm text-slate-600">ID: {complaint.complaint_id || complaint.id}</p>
                              </div>
                            </div>
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(complaint.priority)}`}>
                              {complaint.priority || 'LOW'}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 mb-3">{complaint.description}</p>
                          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                            <span>Status: <strong>{complaint.status || 'SUBMITTED'}</strong></span>
                            <span>Priority: <strong>{complaint.priority || 'LOW'}</strong></span>
                            <span>Submitted: <strong>{formatDate(complaint.submitted_at)}</strong></span>
                            {complaint.assigned_name && <span>Assigned to: <strong>{complaint.assigned_name}</strong></span>}
                          </div>
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => handleViewDetail(complaint)}
                              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                            >
                              View Details & Rate
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* COMPLAINT DETAIL VIEW */}
              {activeView === 'detail' && selectedComplaint && (
                <div>
                  <button
                    type="button"
                    onClick={() => { setActiveView('complaints'); setSelectedComplaint(null); }}
                    className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Complaints
                  </button>

                  <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">{selectedComplaint.title}</h2>
                        <p className="text-sm text-slate-500">ID: {selectedComplaint.complaint_id || selectedComplaint.id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getPriorityColor(selectedComplaint.priority)}`}>
                          {selectedComplaint.priority || 'LOW'}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {selectedComplaint.status || 'SUBMITTED'}
                        </span>
                      </div>
                    </div>
                    <p className="text-slate-700 mb-4">{selectedComplaint.description}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500">Channel</p>
                        <p className="font-medium text-slate-900">{selectedComplaint.channel_name || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Category</p>
                        <p className="font-medium text-slate-900">{selectedComplaint.category_name || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Submitted</p>
                        <p className="font-medium text-slate-900">{formatDate(selectedComplaint.submitted_at)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Assigned To</p>
                        <p className="font-medium text-slate-900">{selectedComplaint.assigned_name || 'Unassigned'}</p>
                      </div>
                    </div>
                  </div>

                  {hearings.length > 0 && (
                    <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
                      <h3 className="text-lg font-semibold text-slate-900 mb-4">Hearing Details</h3>
                      <div className="space-y-3">
                        {hearings.map((hearing) => (
                          <div key={hearing.id} className="border border-slate-200 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-blue-600" />
                                <span className="font-medium text-slate-900">{formatDate(hearing.scheduled_date)} at {hearing.scheduled_time || 'TBD'}</span>
                              </div>
                              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                hearing.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                                hearing.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                'bg-slate-100 text-slate-800'
                              }`}>
                                {hearing.status}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600">Location: {hearing.location || 'TBD'}</p>
                            {hearing.notes && <p className="text-sm text-slate-600 mt-1">Notes: {hearing.notes}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {complaintRemarks.length > 0 && (
                    <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
                      <h3 className="text-lg font-semibold text-slate-900 mb-4">
                        <MessageSquare className="w-5 h-5 inline mr-2" />
                        Remarks
                      </h3>
                      <div className="space-y-3">
                        {complaintRemarks.map((remark) => (
                          <div key={remark.id} className="border border-slate-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-slate-900">{remark.user_name || 'Unknown'}</span>
                              <span className="text-xs text-slate-500">{formatDateTime(remark.created_at)}</span>
                            </div>
                            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{remark.user_role}</span>
                            <p className="text-sm text-slate-700 mt-2">{remark.remark_text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">
                      <Star className="w-5 h-5 inline mr-2" />
                      Rate This Service
                    </h3>

                    {complaintRatings.length > 0 && (
                      <div className="mb-4 space-y-2">
                        {complaintRatings.map((r) => (
                          <div key={r.id} className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-slate-700">{r.user_name}:</span>
                            <span className="text-yellow-500">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                            {r.feedback && <span className="text-slate-500">— {r.feedback}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {ratingSuccess && <p className="text-green-600 text-sm mb-3">{ratingSuccess}</p>}
                    {ratingError && <p className="text-red-600 text-sm mb-3">{ratingError}</p>}

                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm text-slate-700">Your Rating:</span>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRatingValue(star)}
                          onMouseEnter={() => setRatingHover(star)}
                          onMouseLeave={() => setRatingHover(0)}
                          className="text-2xl"
                        >
                          <span className={star <= (ratingHover || ratingValue) ? 'text-yellow-500' : 'text-gray-300'}>★</span>
                        </button>
                      ))}
                      {ratingValue > 0 && <span className="text-sm text-slate-500 ml-2">{ratingValue}/5</span>}
                    </div>

                    <textarea
                      value={ratingFeedback}
                      onChange={(e) => setRatingFeedback(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3"
                      rows="3"
                      placeholder="Optional feedback about the service..."
                    />

                    <button
                      type="button"
                      onClick={handleSubmitRating}
                      disabled={submittingRating || !ratingValue}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submittingRating ? 'Submitting...' : 'Submit Rating'}
                    </button>
                  </div>
                </div>
              )}

              {/* HEARING DETAILS */}
              {activeView === 'hearings' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900 mb-6">Hearing Details</h2>
                  {hearings.length === 0 ? (
                    <div className="text-center py-8">
                      <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-slate-600">No hearings scheduled yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {hearings.map((hearing) => {
                        const complaint = complaints.find((c) => c.id === hearing.complaint_id);
                        return (
                          <div key={hearing.id} className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-start gap-3 flex-1">
                                <Calendar className="w-5 h-5 text-blue-600 mt-1" />
                                <div>
                                  <p className="font-semibold text-slate-900">Hearing for {complaint?.title || 'Complaint'}</p>
                                  <p className="text-sm text-slate-600">ID: {complaint?.complaint_id || complaint?.id || hearing.complaint_id}</p>
                                </div>
                              </div>
                              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                hearing.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                                hearing.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                'bg-slate-100 text-slate-800'
                              }`}>
                                {hearing.status}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600 mb-3">
                              <div>
                                <p className="font-medium text-slate-900">Date & Time</p>
                                <p>{formatDate(hearing.scheduled_date)} at {hearing.scheduled_time || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="font-medium text-slate-900">Location</p>
                                <p>{hearing.location || 'N/A'}</p>
                              </div>
                            </div>
                            {hearing.notes && (
                              <div className="bg-slate-50 p-3 rounded text-sm text-slate-700">
                                <p className="font-medium text-slate-900 mb-1">Notes</p>
                                <p>{hearing.notes}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SUBMIT COMPLAINT */}
              {activeView === 'submit' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm max-w-3xl">
                  <h2 className="text-xl font-semibold text-slate-900 mb-4">Submit Complaint</h2>
                  <p className="text-sm text-slate-600 mb-6">
                    Please provide accurate information about your concern. Your complaint will be reviewed by the barangay personnel.
                  </p>

                  <form onSubmit={handleSubmitComplaint} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Complaint Category *</label>
                      <select
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none bg-white"
                      >
                        <option value="">Select a category</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.name}>{category.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
                      <textarea
                        required
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
                        rows="5"
                        placeholder="Please describe your complaint in detail..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Submission Channel</label>
                      <div className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-700">
                        Online Form
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={submitLoading}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        {submitLoading ? 'Submitting...' : 'Submit Complaint'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({ title: '', description: '', channel: 'Online form' });
                          setFormError('');
                          setActiveView('dashboard');
                        }}
                        className="flex-1 bg-slate-200 text-slate-900 py-2 rounded-lg hover:bg-slate-300 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* NOTIFICATIONS */}
              {activeView === 'notifications' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllAsRead}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <div className="text-center py-8">
                      <Bell className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-slate-600">No notifications yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => !notif.is_read && handleMarkAsRead(notif.id)}
                          className={`flex items-start gap-3 p-4 rounded-lg border transition cursor-pointer ${
                            notif.is_read
                              ? 'bg-white border-slate-200 hover:border-slate-300'
                              : 'bg-blue-50 border-blue-200 hover:border-blue-300'
                          }`}
                        >
                          <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-1 ${notif.is_read ? 'text-slate-400' : 'text-blue-600'}`} />
                          <div className="flex-1">
                            <p className={`font-medium ${notif.is_read ? 'text-slate-700' : 'text-slate-900'}`}>{notif.title}</p>
                            <p className="text-sm text-slate-600 mt-1">{notif.message}</p>
                            <p className="text-xs text-slate-500 mt-2">{notif.created_at ? formatDateTime(notif.created_at) : ''}</p>
                          </div>
                          {!notif.is_read && <span className="w-2.5 h-2.5 bg-blue-600 rounded-full flex-shrink-0 mt-2" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* RATE SERVICES */}
              {activeView === 'ratings' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900 mb-6">Rate Services</h2>
                  <p className="text-sm text-slate-600 mb-6">
                    Select a resolved or closed complaint below to rate the service you received.
                  </p>

                  {complaints.filter((c) => ['RESOLVED', 'CLOSED'].includes(String(c.status || '').toUpperCase())).length === 0 ? (
                    <div className="text-center py-8">
                      <Star className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-slate-600">No resolved complaints to rate yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {complaints
                        .filter((c) => ['RESOLVED', 'CLOSED'].includes(String(c.status || '').toUpperCase()))
                        .map((complaint) => (
                          <div key={complaint.id} className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">{complaint.title}</p>
                                <p className="text-sm text-slate-600">ID: {complaint.complaint_id}</p>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-1">
                                  {complaint.status}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleViewDetail(complaint)}
                                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                              >
                                Rate Now →
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

            </>
          )}

        </div>
      </main>

    </div>
  );
}

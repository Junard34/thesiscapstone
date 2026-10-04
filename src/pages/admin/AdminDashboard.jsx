
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle, useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getAdminAccessToken, authHeaders } from '../../lib/adminAuth';
import api from '../../services/api';

import {
  User,
  LogOut,
  LayoutDashboard,
  Users,
  Shield,
  Radio,
  AlertCircle,
  ChevronDown,
  RefreshCw,
  Eye,
  EyeOff,
  UserCheck,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      {
        key: 'dashboard',
        label: 'View Dashboard',
        icon: LayoutDashboard,
      },
      {
        key: 'pending',
        label: 'Pending Approval',
        icon: UserCheck,
      },
      {
        key: 'accounts',
        label: 'Manage Accounts',
        icon: Users,
      },
      {
        key: 'officials',
        label: 'Assign Brgy Officials',
        icon: Shield,
      },
    ],
  },
  {
    label: 'Manage',
    items: [
      {
        key: 'channels',
        label: 'Manage Channels',
        icon: Radio,
      },
      {
        key: 'logs',
        label: 'View System Logs',
        icon: AlertCircle,
      },
    ],
  },
];

const STAFF_ROLES = [
  { value: 'TANOD', label: 'Brgy Tanod' },
  { value: 'OFFICIAL', label: 'Brgy Official' },
  { value: 'LUPON', label: 'Brgy Lupon' },
];

export default function AdminDashboard() {
  const { user, logout, onlineUsers } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [complaints, setComplaints] = useState([]);

  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingComplaints, setLoadingComplaints] = useState(true);

  const [activeNav, setActiveNav] = useState('dashboard');
  const [showProfile, setShowProfile] = useState(false);
  const [userError, setUserError] = useState('');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState('');
  const [createUserSuccess, setCreateUserSuccess] = useState('');
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'TANOD',
  });

  const [channels, setChannels] = useState([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [newChannel, setNewChannel] = useState({ name: '', description: '' });
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [channelError, setChannelError] = useState('');
  const [channelSuccess, setChannelSuccess] = useState('');
  const [editingChannel, setEditingChannel] = useState(null);

  const [assignableUsers, setAssignableUsers] = useState([]);
  const [loadingAssignable, setLoadingAssignable] = useState(true);
  const [assigningId, setAssigningId] = useState(null);
  const [assignFilter, setAssignFilter] = useState('all');
  const [assignMessage, setAssignMessage] = useState('');

  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logFilter, setLogFilter] = useState('all');
  const [logSearch, setLogSearch] = useState('');

  // =========================
  // LOGOUT
  // =========================
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // =========================
  // NAVIGATION
  // =========================
  const goToNav = (key) => {
    setActiveNav(key);
    setShowProfile(false);
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setCreateUserError('');
    setCreateUserSuccess('');
    setCreatingUser(true);

    try {
      const token = await getAdminAccessToken();
      if (!token) {
        throw new Error('Your admin session has expired. Please log in again.');
      }

      await api.post('/admin/supabase-users', {
        ...newUser,
      }, {
        headers: authHeaders(token),
      });

      setNewUser({
        fullName: '',
        email: '',
        password: '',
        role: 'TANOD',
      });
      setCreateUserSuccess('User created successfully.');
      await fetchUsers();
    } catch (error) {
      setCreateUserError(
        error.response?.data?.message || 'Failed to create user.'
      );
    } finally {
      setCreatingUser(false);
    }
  };

  const handleVerification = async (userId, status) => {
    try {
      setVerificationMessage('');
      setUserError('');

      const token = await getAdminAccessToken();
      if (!token) {
        throw new Error('Your admin session has expired. Please log in again.');
      }

      const response = await api.put(`/admin/users/${userId}/verification`, {
        status,
        modifiedBy: user?.profileId || user?.id,
      }, {
        headers: authHeaders(token),
      });

      setVerificationMessage(
        response.data?.message ||
          (status === 'ACTIVE'
            ? 'Citizen approved successfully.'
            : 'Citizen rejected successfully.')
      );
      await fetchUsers();
    } catch (error) {
      setUserError(error.response?.data?.message || error.message || 'Failed to update verification status.');
    }
  };

  // =========================
  // FETCH REAL USERS
  // =========================
  const fetchUsers = async () => {
    setLoadingUsers(true);
    setUserError('');

    try {
      const token = await getAdminAccessToken();
      if (!token) {
        throw new Error('Your admin session has expired. Please log in again.');
      }

      const response = await api.get('/admin/users', {
        headers: authHeaders(token),
      });

      const data = response.data?.users || [];

      setUsers(
        [...data].sort((firstUser, secondUser) => {
          const firstDate = new Date(firstUser.created_at || 0).getTime();
          const secondDate = new Date(secondUser.created_at || 0).getTime();
          return secondDate - firstDate;
        })
      );
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setUserError(
        error.response?.data?.message ||
          error.message ||
          'Failed to load users.'
      );
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  // =========================
  // FETCH COMPLAINTS
  // =========================
  const fetchComplaints = async () => {
    setLoadingComplaints(true);

    try {
      const token = await getAdminAccessToken();
      const response = await api.get('/admin/complaints', {
        headers: authHeaders(token),
      });

      setComplaints(response.data?.complaints || []);
    } catch (error) {
      console.error('Failed to fetch complaints:', error);
      setComplaints([]);
    } finally {
      setLoadingComplaints(false);
    }
  };

  // =========================
  // FETCH CHANNELS
  // =========================
  const fetchChannels = async () => {
    setLoadingChannels(true);
    try {
      const token = await getAdminAccessToken();
      const response = await api.get('/admin/channels', {
        headers: authHeaders(token),
      });
      setChannels(response.data?.channels || []);
    } catch (error) {
      console.error('Failed to fetch channels:', error);
      setChannels([]);
    } finally {
      setLoadingChannels(false);
    }
  };

  // =========================
  // CREATE CHANNEL
  // =========================
  const handleCreateChannel = async (event) => {
    event.preventDefault();
    setChannelError('');
    setChannelSuccess('');
    setCreatingChannel(true);

    try {
      const token = await getAdminAccessToken();
      await api.post('/admin/channels', {
        name: newChannel.name,
        description: newChannel.description,
      }, {
        headers: authHeaders(token),
      });
      setNewChannel({ name: '', description: '' });
      setChannelSuccess('Channel created successfully.');
      await fetchChannels();
    } catch (error) {
      setChannelError(error.response?.data?.message || 'Failed to create channel.');
    } finally {
      setCreatingChannel(false);
    }
  };

  // =========================
  // UPDATE CHANNEL
  // =========================
  const handleUpdateChannel = async (id) => {
    setChannelError('');
    setChannelSuccess('');
    try {
      const token = await getAdminAccessToken();
      await api.put(`/admin/channels/${id}`, {
        name: editingChannel.name,
        description: editingChannel.description,
      }, {
        headers: authHeaders(token),
      });
      setEditingChannel(null);
      setChannelSuccess('Channel updated successfully.');
      await fetchChannels();
    } catch (error) {
      setChannelError(error.response?.data?.message || 'Failed to update channel.');
    }
  };

  // =========================
  // DELETE CHANNEL
  // =========================
  const handleDeleteChannel = async (id) => {
    if (!window.confirm('Are you sure you want to delete this channel?')) return;
    setChannelError('');
    setChannelSuccess('');
    try {
      const token = await getAdminAccessToken();
      await api.delete(`/admin/channels/${id}`, {
        headers: authHeaders(token),
      });
      setChannelSuccess('Channel deleted successfully.');
      await fetchChannels();
    } catch (error) {
      setChannelError(error.response?.data?.message || 'Failed to delete channel.');
    }
  };

  // =========================
  // FETCH ASSIGNABLE USERS
  // =========================
  const fetchAssignableUsers = async () => {
    setLoadingAssignable(true);
    try {
      const token = await getAdminAccessToken();
      const response = await api.get('/admin/assignable-users', {
        headers: authHeaders(token),
      });
      setAssignableUsers(response.data?.users || []);
    } catch (error) {
      console.error('Failed to fetch assignable users:', error);
      setAssignableUsers([]);
    } finally {
      setLoadingAssignable(false);
    }
  };

  // =========================
  // ASSIGN COMPLAINT
  // =========================
  const handleAssignComplaint = async (complaintId, assignedTo) => {
    setAssigningId(complaintId);
    setAssignMessage('');
    try {
      const token = await getAdminAccessToken();
      await api.put(`/admin/complaints/${complaintId}/assign`, {
        assignedTo: Number(assignedTo),
        assignedBy: user?.profileId || user?.id,
      }, {
        headers: authHeaders(token),
      });
      setAssignMessage('Complaint assigned successfully.');
      await fetchComplaints();
    } catch (error) {
      setAssignMessage(error.response?.data?.message || 'Failed to assign complaint.');
    } finally {
      setAssigningId(null);
    }
  };

  // =========================
  // FETCH LOGS
  // =========================
  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const token = await getAdminAccessToken();
      const response = await api.get('/admin/logs', {
        headers: authHeaders(token),
      });
      setLogs(response.data?.logs || []);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  // =========================
  // INITIAL LOAD
  // =========================
  useEffect(() => {
    fetchUsers();
    fetchComplaints();
    fetchChannels();
    fetchAssignableUsers();
    fetchLogs();
  }, []);

  // =========================
  // STATISTICS
  // =========================
  const stats = {
    totalUsers: users.length,

    pendingVerifications: users.filter(
      (u) =>
        String(u.role || '').toUpperCase() === 'CITIZEN' &&
        u.status === 'PENDING_VERIFICATION'
    ).length,

    totalComplaints: complaints.length,

    resolvedComplaints: complaints.filter((c) =>
      ['RESOLVED', 'CLOSED'].includes(
        String(c.status || '').toUpperCase()
      )
    ).length,

    byRole: {
      CITIZEN: users.filter(
        (u) => String(u.role).toUpperCase() === 'CITIZEN'
      ).length,

      TANOD: users.filter(
        (u) => String(u.role).toUpperCase() === 'TANOD'
      ).length,

      OFFICIAL: users.filter(
        (u) => String(u.role).toUpperCase() === 'OFFICIAL'
      ).length,

      LUPON: users.filter(
        (u) => String(u.role).toUpperCase() === 'LUPON'
      ).length,

      ADMIN: users.filter(
        (u) => String(u.role).toUpperCase() === 'ADMIN'
      ).length,
    },
  };

  const pendingUsers = users.filter(
    (u) =>
      String(u.role || '').toUpperCase() === 'CITIZEN' &&
      u.status === 'PENDING_VERIFICATION'
  );

  const managedUsers = users.filter(
    (u) => u.status !== 'PENDING_VERIFICATION'
  );

  // =========================
  // ROLE BADGE
  // =========================
  const getRoleBadgeColor = (role) => {
    switch (String(role || '').toUpperCase()) {
      case 'ADMIN':
        return 'bg-red-100 text-red-800';

      case 'TANOD':
        return 'bg-purple-100 text-purple-800';

      case 'OFFICIAL':
        return 'bg-green-100 text-green-800';

      case 'LUPON':
        return 'bg-orange-100 text-orange-800';

      case 'CITIZEN':
        return 'bg-blue-100 text-blue-800';

      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // =========================
  // DATE FORMAT
  // =========================
  const formatDate = (date) => {
    if (!date) {
      return '—';
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return '—';
    }

    return parsedDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isUserOnline = (account) =>
    onlineUsers.some((onlineUser) => String(onlineUser.id) === String(account.auth_id));

  const hasPresenceStatus = (role) =>
    ['CITIZEN', 'TANOD', 'OFFICIAL', 'LUPON'].includes(
      String(role || '').toUpperCase()
    );

  return (
    <div className={`${isDark ? 'dashboard-dark' : ''} min-h-screen bg-slate-50 flex`}>

      {/* =====================================
          SIDEBAR
      ===================================== */}
      <aside className="w-64 shrink-0 bg-[#0b1220] text-slate-300 flex flex-col py-5 px-4">

        {/* PROFILE */}
        <div className="relative mb-6">
          <button
            onClick={() =>
              setShowProfile(!showProfile)
            }
            className="w-full flex items-center gap-3 border border-slate-700 rounded-2xl px-3 py-2.5 hover:border-slate-600 transition"
          >
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>

            <div className="text-left flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">
                {user?.name ||
                  user?.fullName ||
                  user?.email ||
                  'Administrator'}
              </p>

              <p className="text-slate-500 text-[11px] uppercase tracking-wide">
                {user?.role || 'ADMIN'}
              </p>
            </div>

            <ChevronDown
              className={`w-4 h-4 text-slate-500 shrink-0 transition ${
                showProfile
                  ? 'rotate-180'
                  : ''
              }`}
            />
          </button>

          {showProfile && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 p-1">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-200 text-sm font-medium hover:bg-slate-700 transition rounded-lg"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          )}
        </div>

        {/* NAVIGATION */}
        <nav className="flex-1 space-y-6 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="px-2 mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                {section.label}
              </p>

              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;

                  const isActive =
                    activeNav === item.key;

                  return (
                    <button
                      key={item.key}
                      onClick={() =>
                        goToNav(item.key)
                      }
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                        isActive
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />

                      <span className="flex-1 text-left">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <ThemeToggle />
      </aside>

      {/* =====================================
          MAIN CONTENT
      ===================================== */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">

          {/* =================================
              DASHBOARD
          ================================= */}
          {activeNav === 'dashboard' && (
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-8">
                Dashboard Overview
              </h1>

              {/* STATS */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">

                <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
                  <p className="text-sm text-slate-600">
                    Total Users
                  </p>

                  <p className="text-3xl font-bold text-slate-900 mt-1">
                    {stats.totalUsers}
                  </p>

                  <p className="text-xs text-slate-500 mt-2">
                    Real accounts in public.users
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => goToNav('pending')}
                  className={`text-left rounded-lg border p-5 shadow-sm transition ${
                    stats.pendingVerifications > 0
                      ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm text-slate-600">
                    Pending Approval
                  </p>

                  <p
                    className={`text-3xl font-bold mt-1 ${
                      stats.pendingVerifications > 0
                        ? 'text-amber-600'
                        : 'text-slate-900'
                    }`}
                  >
                    {stats.pendingVerifications}
                  </p>

                  <p className="text-xs text-slate-500 mt-2">
                    Citizens awaiting verification
                  </p>
                </button>

                <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
                  <p className="text-sm text-slate-600">
                    Total Complaints
                  </p>

                  <p className="text-3xl font-bold text-slate-900 mt-1">
                    {stats.totalComplaints}
                  </p>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
                  <p className="text-sm text-slate-600">
                    Resolved
                  </p>

                  <p className="text-3xl font-bold text-green-600 mt-1">
                    {stats.resolvedComplaints}
                  </p>
                </div>

              </div>

              {/* ROLE BREAKDOWN */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Object.entries(
                  stats.byRole
                ).map(([role, count]) => (
                  <div
                    key={role}
                    className={`rounded-lg border p-4 shadow-sm ${getRoleBadgeColor(
                      role
                    )}`}
                  >
                    <p className="text-sm font-medium">
                      {role}
                    </p>

                    <p className="text-2xl font-bold">
                      {count}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =================================
              PENDING APPROVAL
          ================================= */}
          {activeNav === 'pending' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">
                    Pending Approval
                  </h1>

                  <p className="text-sm text-slate-500 mt-1">
                    Review citizen registrations and Barangay Clearances before granting access.
                  </p>
                </div>

                <button
                  onClick={fetchUsers}
                  disabled={loadingUsers}
                  className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${
                      loadingUsers
                        ? 'animate-spin'
                        : ''
                    }`}
                  />

                  Refresh
                </button>
              </div>

              {verificationMessage && (
                <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
                  {verificationMessage}
                </div>
              )}

              {userError && (
                <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                  <p className="font-semibold">Verification failed</p>
                  <p className="text-sm mt-1">{userError}</p>
                </div>
              )}

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Awaiting Verification
                    </h2>

                    <p className="text-xs text-slate-500 mt-1">
                      {pendingUsers.length} pending citizen registration
                      {pendingUsers.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>

                {loadingUsers ? (
                  <div className="p-10 text-center text-slate-500">
                    Loading pending registrations...
                  </div>
                ) : pendingUsers.length === 0 ? (
                  <div className="p-10 text-center">
                    <UserCheck className="w-10 h-10 mx-auto text-slate-300 mb-3" />

                    <p className="font-medium text-slate-700">
                      No pending registrations
                    </p>

                    <p className="text-sm text-slate-500 mt-1">
                      New citizen accounts awaiting approval will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Full Name</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Email</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Address</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Clearance</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Registered</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Decision</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingUsers.map((u) => (
                          <tr
                            key={u.id}
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >
                            <td className="py-4 px-5 font-medium text-slate-900">
                              {u.full_name || '—'}
                            </td>

                            <td className="py-4 px-5 text-slate-600">
                              {u.email || '—'}
                            </td>

                            <td className="py-4 px-5 text-slate-600">
                              {u.address || '—'}
                            </td>

                            <td className="py-4 px-5">
                              {u.clearance_path ? (
                                <a
                                  href={supabase.storage.from('citizen-documents').getPublicUrl(u.clearance_path).data.publicUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm font-medium text-blue-600 hover:underline"
                                >
                                  View document
                                </a>
                              ) : (
                                <span className="text-xs text-slate-500">No clearance uploaded</span>
                              )}
                            </td>

                            <td className="py-4 px-5 text-slate-600">
                              {formatDate(u.created_at)}
                            </td>

                            <td className="py-4 px-5">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleVerification(u.id, 'ACTIVE')}
                                  className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleVerification(u.id, 'REJECTED')}
                                  className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                                >
                                  Reject
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

          {/* =================================
              MANAGE ACCOUNTS
          ================================= */}
          {activeNav === 'accounts' && (
            <div>

              <div className="flex items-center justify-between mb-6">

                <div>
                  <h1 className="text-3xl font-bold text-slate-900">
                    Manage Accounts
                  </h1>

                  <p className="text-sm text-slate-500 mt-1">
                    Approved and non-pending accounts. Pending registrations are handled under Pending Approval.
                  </p>
                </div>

                <button
                  onClick={fetchUsers}
                  disabled={loadingUsers}
                  className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${
                      loadingUsers
                        ? 'animate-spin'
                        : ''
                    }`}
                  />

                  Refresh
                </button>
              </div>

              {/* ERROR */}
              {userError && (
                <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                  <p className="font-semibold">
                    Failed to load users
                  </p>

                  <p className="text-sm mt-1">
                    {userError}
                  </p>
                </div>
              )}

              {verificationMessage && (
                <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">
                  {verificationMessage}
                </div>
              )}

              {/* USERS TABLE */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">

                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Registered Users
                    </h2>

                    <p className="text-xs text-slate-500 mt-1">
                      {managedUsers.length} account
                      {managedUsers.length !== 1
                        ? 's'
                        : ''}{' '}
                      found
                    </p>
                  </div>

                </div>

                {loadingUsers ? (
                  <div className="p-10 text-center text-slate-500">
                    Loading users from Supabase...
                  </div>
                ) : managedUsers.length === 0 ? (
                  <div className="p-10 text-center">

                    <Users className="w-10 h-10 mx-auto text-slate-300 mb-3" />

                    <p className="font-medium text-slate-700">
                      No users found
                    </p>

                    <p className="text-sm text-slate-500 mt-1">
                      Approved accounts will appear here.
                    </p>

                  </div>
                ) : (
                  <div className="overflow-x-auto">

                    <table className="w-full text-sm">

                      <thead className="bg-slate-50 border-b border-slate-200">

                        <tr>

                          <th className="text-left py-3 px-5 font-semibold text-slate-700">
                            Full Name
                          </th>

                          <th className="text-left py-3 px-5 font-semibold text-slate-700">
                            Email
                          </th>

                          <th className="text-left py-3 px-5 font-semibold text-slate-700">
                            Address
                          </th>

                          <th className="text-left py-3 px-5 font-semibold text-slate-700">
                            Role
                          </th>

                          <th className="text-left py-3 px-5 font-semibold text-slate-700">
                            Verification Status
                          </th>

                          <th className="text-left py-3 px-5 font-semibold text-slate-700">
                            Clearance
                          </th>

                          <th className="text-left py-3 px-5 font-semibold text-slate-700">
                            Presence
                          </th>

                          <th className="text-left py-3 px-5 font-semibold text-slate-700">
                            Auth ID
                          </th>

                          <th className="text-left py-3 px-5 font-semibold text-slate-700">
                            Created
                          </th>

                        </tr>

                      </thead>

                      <tbody>

                        {managedUsers.map((u) => (

                          <tr
                            key={u.id}
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >

                            <td className="py-4 px-5 font-medium text-slate-900">
                              {u.full_name || '—'}
                            </td>

                            <td className="py-4 px-5 text-slate-600">
                              {u.email || '—'}
                            </td>

                            <td className="py-4 px-5 text-slate-600">
                              {u.address || '—'}
                            </td>

                            <td className="py-4 px-5">

                              <span
                                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${getRoleBadgeColor(
                                  u.role
                                )}`}
                              >
                                {u.role || 'CITIZEN'}
                              </span>

                            </td>

                            <td className="py-4 px-5">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                u.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                                u.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                u.status === 'SUSPENDED' ? 'bg-orange-100 text-orange-700' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>
                                {u.status || 'ACTIVE'}
                              </span>

                              {u.role === 'CITIZEN' && u.status === 'REJECTED' && (
                                <div className="mt-2">
                                  <button
                                    type="button"
                                    onClick={() => handleVerification(u.id, 'ACTIVE')}
                                    className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                                  >
                                    Approve
                                  </button>
                                </div>
                              )}
                            </td>

                            <td className="py-4 px-5">
                              {u.clearance_path ? (
                                <a
                                  href={supabase.storage.from('citizen-documents').getPublicUrl(u.clearance_path).data.publicUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm font-medium text-blue-600 hover:underline"
                                >
                                  View document
                                </a>
                              ) : (
                                <span className="text-xs text-slate-500">—</span>
                              )}
                            </td>

                            <td className="py-4 px-5">
                              {hasPresenceStatus(u.role) ? (
                                <span className="inline-flex items-center gap-2 text-xs font-semibold">
                                  <span
                                    className={`h-2.5 w-2.5 rounded-full ${
                                      isUserOnline(u)
                                        ? 'bg-green-500'
                                        : 'bg-red-500'
                                    }`}
                                  />
                                  <span
                                    className={
                                      isUserOnline(u)
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }
                                  >
                                    {isUserOnline(u) ? 'Online' : 'Offline'}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-xs text-slate-500">—</span>
                              )}
                            </td>

                            <td className="py-4 px-5">

                              <span
                                className="font-mono text-xs text-slate-500"
                                title={u.auth_id}
                              >
                                {u.auth_id
                                  ? `${u.auth_id.slice(
                                      0,
                                      8
                                    )}...`
                                  : '—'}
                              </span>

                            </td>

                            <td className="py-4 px-5 text-slate-600">
                              {formatDate(
                                u.created_at
                              )}
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

          {/* =================================
              OFFICIALS
          ================================= */}
          {activeNav === 'officials' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">
                    Assign Barangay Officials
                  </h1>
                  <p className="text-sm text-slate-500 mt-1">
                    Assign complaints to TANOD or LUPON personnel.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={assignFilter}
                    onChange={(e) => setAssignFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="all">All Complaints</option>
                    <option value="unassigned">Unassigned Only</option>
                    <option value="assigned">Assigned Only</option>
                  </select>
                  <button
                    onClick={() => { fetchComplaints(); fetchAssignableUsers(); }}
                    disabled={loadingComplaints}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingComplaints ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {assignMessage && (
                <div className={`mb-4 rounded-lg border p-3 text-sm ${
                  assignMessage.includes('successfully')
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}>
                  {assignMessage}
                </div>
              )}

              {loadingAssignable ? (
                <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">
                  Loading assignable users...
                </div>
              ) : complaints.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                  <Shield className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                  <p className="font-medium text-slate-700">No complaints found</p>
                  <p className="text-sm text-slate-500 mt-1">There are no complaints to assign.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-3 px-5 font-semibold text-slate-700">ID</th>
                        <th className="text-left py-3 px-5 font-semibold text-slate-700">Title</th>
                        <th className="text-left py-3 px-5 font-semibold text-slate-700">Citizen</th>
                        <th className="text-left py-3 px-5 font-semibold text-slate-700">Priority</th>
                        <th className="text-left py-3 px-5 font-semibold text-slate-700">Status</th>
                        <th className="text-left py-3 px-5 font-semibold text-slate-700">Assigned To</th>
                        <th className="text-left py-3 px-5 font-semibold text-slate-700">Assign</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complaints
                        .filter((c) => {
                          if (assignFilter === 'unassigned') return !c.assigned_to;
                          if (assignFilter === 'assigned') return c.assigned_to;
                          return true;
                        })
                        .map((complaint) => (
                        <tr key={complaint.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-4 px-5 font-mono text-xs text-slate-500">
                            {complaint.complaint_id || `#${complaint.id}`}
                          </td>
                          <td className="py-4 px-5 font-medium text-slate-900">
                            {complaint.title || '—'}
                          </td>
                          <td className="py-4 px-5 text-slate-600">
                            {complaint.citizen_name || '—'}
                          </td>
                          <td className="py-4 px-5">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                              complaint.priority === 'HIGH' ? 'bg-red-100 text-red-800' :
                              complaint.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {complaint.priority || 'MEDIUM'}
                            </span>
                          </td>
                          <td className="py-4 px-5">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                              complaint.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-800' :
                              complaint.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                              'bg-slate-100 text-slate-800'
                            }`}>
                              {complaint.status || 'SUBMITTED'}
                            </span>
                          </td>
                          <td className="py-4 px-5 text-slate-600">
                            {complaint.assigned_to || '—'}
                          </td>
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-2">
                              <select
                                id={`assign-${complaint.id}`}
                                defaultValue=""
                                className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                              >
                                <option value="" disabled>Select...</option>
                                {assignableUsers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.full_name} ({u.role})
                                  </option>
                                ))}
                              </select>
                              <button
                                disabled={assigningId === complaint.id}
                                onClick={() => {
                                  const select = document.getElementById(`assign-${complaint.id}`);
                                  if (select.value) {
                                    handleAssignComplaint(complaint.id, select.value);
                                  }
                                }}
                                className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                              >
                                {assigningId === complaint.id ? '...' : 'Assign'}
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
          )}

          {/* =================================
              CHANNELS
          ================================= */}
          {activeNav === 'channels' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">Manage Channels</h1>
                  <p className="text-sm text-slate-500 mt-1">
                    Manage how citizens can report their issues.
                  </p>
                </div>
                <button
                  onClick={fetchChannels}
                  disabled={loadingChannels}
                  className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingChannels ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <form
                onSubmit={handleCreateChannel}
                className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-6"
              >
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Add New Channel</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="text-sm font-medium text-slate-700">
                    Channel Name
                    <input
                      required
                      type="text"
                      value={newChannel.name}
                      onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="e.g. Online Form, SMS, Walk-in"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Description
                    <input
                      type="text"
                      value={newChannel.description}
                      onChange={(e) => setNewChannel({ ...newChannel, description: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="Brief description (optional)"
                    />
                  </label>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm">
                    {channelError && <p className="text-red-600">{channelError}</p>}
                    {channelSuccess && <p className="text-green-600">{channelSuccess}</p>}
                  </div>
                  <button
                    type="submit"
                    disabled={creatingChannel}
                    className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creatingChannel ? 'Creating...' : 'Add Channel'}
                  </button>
                </div>
              </form>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900">Channels</h2>
                  <p className="text-xs text-slate-500 mt-1">{channels.length} channel(s) found</p>
                </div>

                {loadingChannels ? (
                  <div className="p-10 text-center text-slate-500">Loading channels...</div>
                ) : channels.length === 0 ? (
                  <div className="p-10 text-center">
                    <Radio className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="font-medium text-slate-700">No channels yet</p>
                    <p className="text-sm text-slate-500 mt-1">Add your first reporting channel above.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Name</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Description</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Complaints</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Created</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {channels.map((ch) => (
                          <tr key={ch.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-4 px-5 font-medium text-slate-900">
                              {editingChannel?.id === ch.id ? (
                                <input
                                  type="text"
                                  value={editingChannel.name}
                                  onChange={(e) => setEditingChannel({ ...editingChannel, name: e.target.value })}
                                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                />
                              ) : (
                                ch.name
                              )}
                            </td>
                            <td className="py-4 px-5 text-slate-600">
                              {editingChannel?.id === ch.id ? (
                                <input
                                  type="text"
                                  value={editingChannel.description || ''}
                                  onChange={(e) => setEditingChannel({ ...editingChannel, description: e.target.value })}
                                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                />
                              ) : (
                                ch.description || '—'
                              )}
                            </td>
                            <td className="py-4 px-5 text-slate-600">{ch.complaint_count || 0}</td>
                            <td className="py-4 px-5 text-slate-600">{formatDate(ch.created_at)}</td>
                            <td className="py-4 px-5">
                              <div className="flex items-center gap-2">
                                {editingChannel?.id === ch.id ? (
                                  <>
                                    <button
                                      onClick={() => handleUpdateChannel(ch.id)}
                                      className="text-green-600 hover:text-green-700 text-xs font-medium"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingChannel(null)}
                                      className="text-slate-500 hover:text-slate-700 text-xs font-medium"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => setEditingChannel({ id: ch.id, name: ch.name, description: ch.description })}
                                      className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteChannel(ch.id)}
                                      className="text-red-600 hover:text-red-700 text-xs font-medium"
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
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

          {/* =================================
              LOGS
          ================================= */}
          {activeNav === 'logs' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">System Logs</h1>
                  <p className="text-sm text-slate-500 mt-1">
                    Monitor all system activity and user actions.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Search by user or action..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="all">All Actions</option>
                    <option value="USER_CREATED">User Created</option>
                    <option value="USER_UPDATED">User Updated</option>
                    <option value="CITIZEN_APPROVED">Citizen Approved</option>
                    <option value="CITIZEN_REJECTED">Citizen Rejected</option>
                    <option value="CHANNEL_CREATED">Channel Created</option>
                    <option value="CHANNEL_UPDATED">Channel Updated</option>
                    <option value="CHANNEL_DELETED">Channel Deleted</option>
                    <option value="COMPLAINT_ASSIGNED">Complaint Assigned</option>
                    <option value="PRIORITY_CHANGED">Priority Changed</option>
                    <option value="HEARING_CREATED">Hearing Created</option>
                    <option value="HEARING_UPDATED">Hearing Updated</option>
                  </select>
                  <button
                    onClick={fetchLogs}
                    disabled={loadingLogs}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingLogs ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <p className="text-xs text-slate-500">
                    {logs.filter((log) => {
                      const matchesFilter = logFilter === 'all' || log.action === logFilter;
                      const matchesSearch = !logSearch || log.user_name?.toLowerCase().includes(logSearch.toLowerCase()) || log.action?.toLowerCase().includes(logSearch.toLowerCase());
                      return matchesFilter && matchesSearch;
                    }).length} log(s) shown
                  </p>
                </div>

                {loadingLogs ? (
                  <div className="p-10 text-center text-slate-500">Loading logs...</div>
                ) : logs.length === 0 ? (
                  <div className="p-10 text-center">
                    <AlertCircle className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="font-medium text-slate-700">No logs yet</p>
                    <p className="text-sm text-slate-500 mt-1">System activity will appear here.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Date</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">User</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Action</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Target</th>
                          <th className="text-left py-3 px-5 font-semibold text-slate-700">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs
                          .filter((log) => {
                            const matchesFilter = logFilter === 'all' || log.action === logFilter;
                            const matchesSearch = !logSearch ||
                              log.user_name?.toLowerCase().includes(logSearch.toLowerCase()) ||
                              log.action?.toLowerCase().includes(logSearch.toLowerCase());
                            return matchesFilter && matchesSearch;
                          })
                          .map((log) => (
                          <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-4 px-5 text-slate-600">
                              {formatDate(log.created_at)}
                            </td>
                            <td className="py-4 px-5 font-medium text-slate-900">
                              {log.user_name || 'System'}
                            </td>
                            <td className="py-4 px-5">
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                                log.action?.includes('CREATED') ? 'bg-green-100 text-green-800' :
                                log.action?.includes('UPDATED') ? 'bg-blue-100 text-blue-800' :
                                log.action?.includes('DELETED') ? 'bg-red-100 text-red-800' :
                                log.action?.includes('ASSIGNED') ? 'bg-purple-100 text-purple-800' :
                                log.action?.includes('APPROVED') ? 'bg-green-100 text-green-800' :
                                log.action?.includes('REJECTED') ? 'bg-red-100 text-red-800' :
                                'bg-slate-100 text-slate-800'
                              }`}>
                                {log.action || '—'}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-slate-600 font-mono text-xs">
                              {log.target_record || '—'}
                            </td>
                            <td className="py-4 px-5 text-slate-600 text-xs max-w-xs truncate">
                              {log.details || '—'}
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

        </div>
      </main>
    </div>
  );
}


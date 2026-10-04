
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import api from '../services/api';

const AuthContext = createContext(null);
const STORED_USER_KEY = 'barangay-saray-user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState([]);

  // ==========================================
  // GET USER PROFILE FROM public.users
  // ==========================================
  const getUserData = async (authUser) => {
    if (!authUser) {
      return null;
    }

    try {
      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', authUser.id)
        .maybeSingle();

      if (error) {
        console.error(
          'Error loading user profile:',
          error
        );
      }

      const rawRole =
        profile?.role ||
        authUser.user_metadata?.role ||
        authUser.user_metadata?.name ||
        'CITIZEN';

      let role = rawRole;
      if (role && typeof role === 'object') {
        role = role.name || role.role_name || role.role || 'CITIZEN';
      }
      role = String(role || 'CITIZEN').trim().toUpperCase() || 'CITIZEN';

      return {
        id: authUser.id,

        email:
          profile?.email ||
          authUser.email ||
          '',

        name:
          profile?.full_name ||
          authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name ||
          '',

        role,

        phone:
          profile?.phone ||
          '',

        address:
          profile?.address ||
          '',

        status:
          profile?.status ||
          'ACTIVE',

        profileId:
          profile?.id ||
          null,

        authId: authUser.id,
      };
    } catch (error) {
      console.error(
        'Failed to get user data:',
        error
      );

      const fallbackRole =
        authUser.user_metadata?.role ||
        authUser.user_metadata?.name ||
        'CITIZEN';

      let role = fallbackRole;
      if (role && typeof role === 'object') {
        role = role.name || role.role_name || role.role || 'CITIZEN';
      }
      role = String(role || 'CITIZEN').trim().toUpperCase() || 'CITIZEN';

      return {
        id: authUser.id,
        email: authUser.email || '',
        name:
          authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name ||
          '',
        role,
        phone: '',
        address: '',
        status: 'ACTIVE',
        profileId: null,
        authId: authUser.id,
      };
    }
  };

  // ==========================================
  // LOAD CURRENT SESSION
  // ==========================================
  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      try {
        let sessionUser = null;

        if (isSupabaseConfigured) {
          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();

          if (error) {
            console.error('Session error:', error);
          }

          if (session?.user) {
            sessionUser = session.user;
          }
        }

        if (!mounted) return;

        if (sessionUser) {
          const userData = await getUserData(sessionUser);

          if (mounted) {
            if (userData.role === 'CITIZEN' && userData.status !== 'ACTIVE') {
              if (isSupabaseConfigured) {
                await supabase.auth.signOut();
              }
              localStorage.removeItem('authToken');
              localStorage.removeItem(STORED_USER_KEY);
              setUser(null);
            } else {
              const {
                data: { session },
              } = await supabase.auth.getSession();
              const liveToken = session?.access_token;
              const storedToken = localStorage.getItem('authToken');

              // Keep API token in sync with a valid Supabase session.
              if (liveToken && liveToken !== storedToken) {
                localStorage.setItem('authToken', liveToken);
              }

              const mergedUser = {
                ...userData,
              };
              if (!mergedUser.authId && sessionUser.id) {
                mergedUser.authId = sessionUser.id;
              }
              if (!mergedUser.profileId) {
                mergedUser.profileId = mergedUser.id;
              }
              setUser(mergedUser);
              await syncUserToSQLite(sessionUser, mergedUser);
            }
          }
        } else {
          const storedUser = window.localStorage.getItem(STORED_USER_KEY);
          try {
            const parsedUser = storedUser ? JSON.parse(storedUser) : null;
            const blockedCitizen =
              parsedUser?.role === 'CITIZEN' && parsedUser.status !== 'ACTIVE';

            if (blockedCitizen) {
              localStorage.removeItem('authToken');
              localStorage.removeItem(STORED_USER_KEY);
              setUser(null);
            } else {
              setUser(parsedUser);
            }
          } catch {
            window.localStorage.removeItem(STORED_USER_KEY);
            window.localStorage.removeItem('authToken');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Error loading session:', error);

        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event);

      if (!mounted) return;

      if (session?.user) {
        const userData = await getUserData(session.user);

        if (mounted) {
          if (userData.role === 'CITIZEN' && userData.status !== 'ACTIVE') {
            await supabase.auth.signOut();
            localStorage.removeItem('authToken');
            localStorage.removeItem(STORED_USER_KEY);
            setUser(null);
          } else {
            setUser(userData);
            await syncUserToSQLite(session.user, userData);
          }
        }
      } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        localStorage.removeItem('authToken');
        localStorage.removeItem(STORED_USER_KEY);
        setUser(null);
      }

      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setOnlineUsers([]);
      return undefined;
    }

    const presenceChannel = supabase.channel('barangay-dashboard-presence', {
      config: {
        presence: {
          key: String(user.id),
        },
      },
    });

    const updateOnlineUsers = () => {
      const presenceState = presenceChannel.presenceState();
      const users = Object.entries(presenceState).flatMap(
        ([userId, presences]) =>
          presences.map((presence) => ({
            id: userId,
            role: presence.role,
          }))
      );

      setOnlineUsers(users);
    };

    presenceChannel.on('presence', { event: 'sync' }, updateOnlineUsers);
    presenceChannel.on('presence', { event: 'join' }, updateOnlineUsers);
    presenceChannel.on('presence', { event: 'leave' }, updateOnlineUsers);

    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel.track({
          role: String(user.role || '').toUpperCase(),
        });
        updateOnlineUsers();
      }
    });

    return () => {
      presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
    };
  }, [user?.id, user?.role]);

  // ==========================================
  // SYNC USER TO SQLITE
  // ==========================================
  const syncUserToSQLite = async (authUser, userData) => {
    try {
      await api.post('/admin/sync-user', {
        authId: authUser.id,
        email: userData?.email || authUser.email,
        fullName: userData?.name || authUser.user_metadata?.full_name || authUser.user_metadata?.name || '',
        role: userData?.role || authUser.user_metadata?.role || 'CITIZEN',
      });
    } catch (error) {
      console.warn('Failed to sync user to SQLite:', error);
    }
  };

  // ==========================================
  // LOGIN
  // ==========================================
  const login = async (
    email,
    password
  ) => {
    try {
      const cleanEmail = email.trim();

      const { data } = await api.post('/auth/login', {
        email: cleanEmail,
        password,
      });

      if (!data?.user) {
        throw new Error('Login failed.');
      }

      const rawRole = data.user.role;
      let normalizedRole = rawRole;
      if (normalizedRole && typeof normalizedRole === 'object') {
        normalizedRole = normalizedRole.name || normalizedRole.role_name || normalizedRole.role || 'CITIZEN';
      }
      normalizedRole = String(normalizedRole || 'CITIZEN').trim().toUpperCase() || 'CITIZEN';

      const userData = {
        ...data.user,
        name: data.user.fullName || data.user.name || '',
        role: normalizedRole,
        profileId: data.user.profileId || data.user.id || null,
        authId: data.user.authId || data.user.id || null,
      };

      // Best-effort Supabase browser session for storage/admin UI.
      if (isSupabaseConfigured) {
        try {
          const { error: supabaseLoginError } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

          if (!supabaseLoginError) {
            const {
              data: { session },
            } = await supabase.auth.getSession();

            if (session?.user) {
              const profileData = await getUserData(session.user);
              if (profileData && profileData.role) {
                userData.profileId = profileData.profileId || userData.profileId;
                userData.authId = profileData.authId || userData.authId;
                if (profileData.status) {
                  userData.status = profileData.status;
                }
                if (profileData.address) {
                  userData.address = profileData.address;
                }
              }
            }
          } else {
            console.warn('Supabase session login warning:', supabaseLoginError.message);
          }
        } catch (sessionError) {
          console.warn('Supabase session setup skipped:', sessionError?.message || sessionError);
        }
      }

      localStorage.setItem('authToken', data.token);
      localStorage.setItem(STORED_USER_KEY, JSON.stringify(userData));
      setUser(userData);

      return userData;
    } catch (error) {
      if (isSupabaseConfigured) {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore cleanup errors
        }
      }

      const message = error.response?.data?.message || error.message;
      const detail = error.response?.data?.detail;
      const combined =
        detail && message && !String(message).includes(String(detail))
          ? `${message} (${detail})`
          : message;
      throw new Error(combined || 'Login failed.');
    }
  };

  // ==========================================
  // REGISTER
  // ==========================================
  const register = async ({
    email,
    password,
    name,
    address,
    clearanceFile,
  }) => {
    const cleanEmail =
      email.trim();

    const cleanName =
      name.trim();

    if (!clearanceFile) {
      throw new Error('Barangay Clearance is required.');
    }

    const documentContent = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Could not read the Barangay Clearance file.'));
      reader.readAsDataURL(clearanceFile);
    });

    const { data } = await api.post('/auth/register', {
      fullName: cleanName,
      email: cleanEmail,
      password,
      address: address?.trim() || '',
      clearance: {
        name: clearanceFile.name,
        type: clearanceFile.type,
        content: documentContent,
      },
    }).catch((error) => {
      const message = error.response?.data?.message || error.message;
      const detail = error.response?.data?.detail;
      const combined =
        detail && message && !String(message).includes(String(detail))
          ? `${message} (${detail})`
          : message;
      throw new Error(combined || 'Registration failed. Please try again.');
    });

    // IMPORTANT:
    // Do not manually log the user in here.
    //
    // If Supabase email confirmation is enabled,
    // the user should verify their email and then
    // go to the Login page.

    return data;
  };

  // ==========================================
  // LOGOUT
  // ==========================================
  const logout = async () => {
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.warn('Supabase logout warning:', error.message);
        }
      }
    } catch (error) {
      console.warn('Logout error (continuing local cleanup):', error?.message || error);
    }

    setUser(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem(STORED_USER_KEY);
  };

  // ==========================================
  // CONTEXT VALUE
  // ==========================================
  const value = useMemo(
    () => ({
      user,
      loading,
      onlineUsers,
      login,
      register,
      logout,
    }),
    [user, loading, onlineUsers]
  );

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
          <div className="text-center">
            <div className="mb-3 text-xl font-semibold">Loading...</div>
            <div className="text-sm text-slate-400">Checking your session</div>
          </div>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
}

// ==========================================
// useAuth HOOK
// ==========================================
export function useAuth() {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used inside an AuthProvider'
    );
  }

  return context;
}
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getDashboardPath } from '../../lib/adminAuth';

function getLoginErrorInfo(message = '') {
  const lower = message.toLowerCase();

  if (lower.includes('pending')) {
    return {
      tone: 'warning',
      title: 'Account pending verification',
      body: 'Your account is awaiting Barangay Clearance verification. Please wait for the admin to approve your registration before logging in.',
    };
  }

  if (lower.includes('reject')) {
    return {
      tone: 'danger',
      title: 'Registration rejected',
      body: 'Your registration was rejected. Please contact the Barangay Saray administrator, or re-register with a valid Barangay Clearance.',
    };
  }

  return {
    tone: 'danger',
    title: 'Login failed',
    body: message || 'Please check your email and password.',
  };
}

export default function LoginPage() {
  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [errorInfo, setErrorInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError('');
    setErrorInfo(null);
    setLoading(true);

    try {
      const user = await login(
        form.email.trim(),
        form.password
      );

      const destination = getDashboardPath(user?.role);
      if (destination === '/login') {
        throw new Error(
          `Login succeeded, but your account role (${user?.role || 'unknown'}) is not mapped to a dashboard. Please contact the administrator.`
        );
      }

      navigate(destination, {
        replace: true,
      });
    } catch (err) {
      console.error('Login error:', err);

      const message =
        err.message ||
        'Login failed. Please check your email and password.';

      setError(message);
      setErrorInfo(getLoginErrorInfo(message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white bg-center bg-no-repeat p-6"
      style={{
        backgroundImage: "url('/logo.png')",
        backgroundSize: '300px',
      }}
    >
      {/* Login Form */}
      <div className="relative z-10 w-full max-w-md rounded-3xl border-2 border-gray-300 bg-transparent p-8">
        <div className="relative z-10">

          {/* Title */}
          <h1 className="mb-1 text-center text-3xl font-bold text-gray-900">
            Login
          </h1>

          <p className="mb-6 text-center text-sm text-gray-600">
            Welcome back to your Barangay Saray account
          </p>

          <form
            className="space-y-4"
            onSubmit={handleSubmit}
          >

            {/* Email */}
            <div>
              <label className="mb-2 block px-2 text-sm font-semibold text-gray-800">
                Email
              </label>

              <input
                type="email"
                required
                value={form.email}
                onChange={(event) =>
                  setForm({
                    ...form,
                    email: event.target.value,
                  })
                }
                className="w-full rounded-full border border-gray-400 bg-white/70 px-5 py-3 text-gray-900 placeholder-gray-500 outline-none transition focus:border-gray-700 focus:bg-white"
                placeholder="Enter your email"
              />
            </div>

            {/* Password */}
            <div>
              <label className="mb-2 block px-2 text-sm font-semibold text-gray-800">
                Password
              </label>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      password: event.target.value,
                    })
                  }
                  className="w-full rounded-full border border-gray-400 bg-white/70 px-5 py-3 pr-12 text-gray-900 placeholder-gray-500 outline-none transition focus:border-gray-700 focus:bg-white"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 transition hover:text-gray-900"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Remember Me / Forgot Password */}
            <div className="flex items-center justify-between px-2 text-sm text-gray-800">

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) =>
                    setRememberMe(event.target.checked)
                  }
                  className="h-4 w-4 cursor-pointer rounded border-gray-400 accent-gray-800"
                />

                <span>Remember me</span>
              </label>

              <Link
                to="/forgot-password"
                className="font-medium text-gray-800 transition hover:text-black hover:underline"
              >
                Forgot password?
              </Link>

            </div>

            {/* Error */}
            {error && (
              <div
                className={`rounded-xl border p-3 text-sm ${
                  errorInfo?.tone === 'warning'
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-red-300 bg-red-100 text-red-700'
                }`}
              >
                {errorInfo?.title && (
                  <p className="mb-1 font-semibold">{errorInfo.title}</p>
                )}
                <p>{errorInfo?.body || error}</p>
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-gray-900 px-4 py-3 font-semibold text-white shadow-md transition hover:bg-gray-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>

          </form>

          {/* Register Link */}
          <div className="mt-6 text-center text-sm text-gray-700">
            Don't have an account?{' '}

            <Link
              to="/register"
              className="font-semibold text-gray-900 transition hover:text-black hover:underline"
            >
              Register
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
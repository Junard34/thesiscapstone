
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Eye, EyeOff } from 'lucide-react';

function RegisterPage() {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [address, setAddress] = useState('');
  const [clearanceFile, setClearanceFile] = useState(null);

  const { register, logout } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError('');
    setSuccess('');

    // Validate fields
    if (
      !form.fullName.trim() ||
      !form.email.trim() ||
      !form.password ||
      !form.confirmPassword ||
      !address.trim() ||
      !clearanceFile
    ) {
      setError('All fields are required.');
      return;
    }

    // Validate password
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // Validate password length
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(clearanceFile.type)) {
      setError('Barangay Clearance must be a PDF, JPG, or PNG file.');
      return;
    }

    if (clearanceFile.size > 5 * 1024 * 1024) {
      setError('Barangay Clearance must be 5 MB or smaller.');
      return;
    }

    setLoading(true);

    try {
      if (!isSupabaseConfigured) {
        throw new Error(
          'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the project .env file, then restart the app.'
        );
      }

      // Register the account
      await register({
        email: form.email.trim(),
        password: form.password,
        name: form.fullName.trim(),
        address: address.trim(),
        clearanceFile,
      });

      /*
       * IMPORTANT:
       * If Supabase email confirmation is disabled,
       * Supabase automatically creates a session after
       * registration.
       *
       * We sign the user out immediately so they must
       * login manually after registration.
       */
      try {
        await logout();
      } catch (logoutError) {
        console.warn(
          'Automatic logout after registration failed:',
          logoutError
        );
      }

      setSuccess(
        'Registration submitted. Your account is pending Barangay Clearance verification. Redirecting you to the login page...'
      );

      // Go to login page after registration
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1500);
    } catch (err) {
      console.error('Registration error:', err);

      let message =
        err?.message || 'Registration failed. Please try again.';

      if (
        message
          .toLowerCase()
          .includes('user already registered')
      ) {
        message =
          'This email is already registered. Please login instead.';
      }

      setError(message);
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
      <div className="relative z-10 w-full max-w-md rounded-3xl border-2 border-gray-300 bg-white/40 p-8 backdrop-blur-sm">

        {/* Background Barangay Seal */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
        >
          <img
            src="/barangay-seal.png"
            alt=""
            className="w-2/3 max-w-[260px] object-contain opacity-[0.05]"
          />
        </div>

        <div className="relative z-10">

          {/* Header */}
          <h1 className="mb-1 text-center text-3xl font-bold text-gray-900">
            Register
          </h1>

          <p className="mb-6 text-center text-sm text-gray-600">
            Create your Barangay Saray account
          </p>

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Full Name */}
            <div>
              <label className="mb-2 block px-2 text-sm font-semibold text-gray-800">
                Full Name
              </label>

              <input
                type="text"
                value={form.fullName}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fullName: e.target.value,
                  })
                }
                className="w-full rounded-full border border-gray-400 bg-white/70 px-5 py-3 text-gray-900 outline-none focus:border-gray-700"
                placeholder="Enter your full name"
                disabled={loading}
              />
            </div>

            {/* Email */}
            <div>
              <label className="mb-2 block px-2 text-sm font-semibold text-gray-800">
                Email
              </label>

              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm({
                    ...form,
                    email: e.target.value,
                  })
                }
                className="w-full rounded-full border border-gray-400 bg-white/70 px-5 py-3 text-gray-900 outline-none focus:border-gray-700"
                placeholder="Enter your email"
                disabled={loading}
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
                  value={form.password}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      password: e.target.value,
                    })
                  }
                  className="w-full rounded-full border border-gray-400 bg-white/70 px-5 py-3 pr-12 text-gray-900 outline-none focus:border-gray-700"
                  placeholder="Enter your password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="mb-2 block px-2 text-sm font-semibold text-gray-800">
                Confirm Password
              </label>

              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      confirmPassword: e.target.value,
                    })
                  }
                  className="w-full rounded-full border border-gray-400 bg-white/70 px-5 py-3 pr-12 text-gray-900 outline-none focus:border-gray-700"
                  placeholder="Confirm your password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                  title={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900"
                  disabled={loading}
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            {/* Address */}
            <div>
              <label className="mb-2 block px-2 text-sm font-semibold text-gray-800">
                Address
              </label>

              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-full border border-gray-400 bg-white/70 px-5 py-3 text-gray-900 outline-none focus:border-gray-700"
                placeholder="Enter your address"
                disabled={loading}
              />
            </div>

            {/* Barangay Clearance */}
            <div>
              <label className="mb-2 block px-2 text-sm font-semibold text-gray-800">
                Barangay Clearance *
              </label>

              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(e) => setClearanceFile(e.target.files?.[0] || null)}
                className="w-full rounded-full border border-gray-400 bg-white/70 px-5 py-3 text-gray-900 outline-none focus:border-gray-700 file:mr-3 file:rounded-full file:border-0 file:bg-gray-900 file:px-4 file:py-2 file:text-white"
                disabled={loading}
              />

              <p className="mt-2 px-2 text-xs text-gray-600">
                Upload a valid Barangay Clearance (PDF, JPG, or PNG; maximum 5 MB).
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-xl border border-red-300 bg-red-100 p-3 text-center text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="rounded-xl border border-green-300 bg-green-100 p-3 text-center text-sm text-green-700">
                {success}
              </div>
            )}

            {/* Register Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-gray-900 px-4 py-3 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? 'Creating Account...'
                : 'Register'}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center text-sm text-gray-700">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-gray-900 hover:underline"
            >
              Login
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}

export default RegisterPage;

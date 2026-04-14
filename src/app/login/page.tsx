'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Normalize: lowercase and handle non-email username
    let loginEmail = username.trim().toLowerCase();
    if (!loginEmail.includes('@')) {
      loginEmail = `${loginEmail}@bbsc.com`;
    }

    try {
      await signInWithEmailAndPassword(auth, loginEmail, password);
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      let msg = 'Tên đăng nhập hoặc mật khẩu không đúng.';
      if (err.code === 'auth/network-request-failed') {
        msg = 'Lỗi kết nối mạng (WiFi quán cafe có thể chặn Firebase).';
      } else if (err.code !== 'auth/invalid-credential' && err.code !== 'auth/user-not-found' && err.code !== 'auth/invalid-email') {
        msg = `Lỗi: ${err.code} - ${err.message}`;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0d1b2e] to-[#1a3a5c]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">BBSC System</h1>
          <p className="text-blue-300 text-sm mt-1">Quản lý sự cố hàng hóa v3.0</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Đăng nhập hệ thống</h2>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="form-label">Tên đăng nhập <span className="required">*</span></label>
              <input
                id="login-username"
                type="text"
                className="form-input"
                placeholder="VD: khoilm"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="form-label">Mật khẩu <span className="required">*</span></label>
              <input
                id="login-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}

            <button
              id="btn-login-submit"
              type="submit"
              disabled={loading}
              className="btn btn-primary justify-center py-2.5 mt-1"
            >
              {loading ? <><span className="spinner" style={{ width: '1rem', height: '1rem' }} /> Đang đăng nhập...</> : 'Đăng nhập'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            BBSC System © 2025 IT Team
          </p>
        </div>
      </div>
    </div>
  );
}

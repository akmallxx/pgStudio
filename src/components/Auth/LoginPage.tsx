import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ArrowRight, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { Card, Input, Button } from '../ui';

interface LoginPageProps {
  onLoginSuccess: (token: string, username: string) => void;
  onShowToast?: (message: string, icon?: string, isError?: boolean) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onShowToast }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Username dan password wajib diisi.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.login({
        username: username.trim(),
        password,
      });

      if (res.success && res.token) {
        localStorage.setItem('pgstudio_token', res.token);
        localStorage.setItem('pgstudio_username', res.user?.username || username.trim());
        if (onShowToast) {
          onShowToast(`Selamat datang kembali, ${res.user?.username || username}!`, 'verified');
        }
        onLoginSuccess(res.token, res.user?.username || username.trim());
      } else {
        setErrorMessage(res.message || 'Kredensial tidak valid');
      }
    } catch (err: any) {
      if (err?.status === 429) {
        setErrorMessage('Terlalu banyak percobaan login (Rate limit 20 req/s). Harap tunggu beberapa detik.');
      } else {
        setErrorMessage(err?.message || 'Login gagal. Periksa username dan password.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-surface-container-lowest text-on-surface flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[350px] h-[250px] bg-secondary/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Decorative grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#171f3308_1px,transparent_1px),linear-gradient(to_bottom,#171f3308_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Main Login Card */}
      <Card className="w-full max-w-[420px] bg-surface-container-low/90 backdrop-blur-md p-7 relative z-10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-on-surface">pgStudio</h1>
          </div>
          <p className="text-xs text-on-surface-variant mt-1">
            PostgreSQL Developer Fleet Studio
          </p>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300 animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Input */}
          <Input
            label="Username"
            leftIcon={<User className="w-4 h-4" />}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Masukkan username"
            autoFocus
            disabled={isLoading}
            autoComplete="username"
          />

          {/* Password Input */}
          <Input
            label="Password"
            leftIcon={<Lock className="w-4 h-4" />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Masukkan password"
            disabled={isLoading}
            autoComplete="current-password"
          />

          {/* Submit Button */}
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isLoading}
            rightIcon={<ArrowRight className="w-4 h-4" />}
            className="w-full mt-2"
          >
            {isLoading ? 'Memverifikasi kredensial...' : 'Masuk ke Studio'}
          </Button>
        </form>
      </Card>
    </div>
  );
};

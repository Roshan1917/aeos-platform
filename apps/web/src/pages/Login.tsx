import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';

import { login } from '../lib/clients/substrate';
import { useAuthStore } from '../lib/auth';

interface FormValues {
  tenant_slug: string;
  email: string;
  password: string;
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const setTokens = useAuthStore((s) => s.setTokens);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { tenant_slug: 'dev-corp', email: 'admin@dev-corp.local', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const tokens = await login(values.email, values.password, values.tenant_slug);
      setTokens({ access: tokens.access_token, refresh: tokens.refresh_token });
      const dest = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(dest, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid h-full place-items-center bg-canvas">
      <div className="w-[400px] card p-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-brand grid place-items-center text-white text-sm font-bold">A</div>
          <div>
            <div className="text-base font-semibold leading-none">AEOS</div>
            <div className="text-xs text-ink-muted leading-none mt-0.5">Sign in to continue</div>
          </div>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-ink-subtle">Tenant slug</label>
            <input
              {...register('tenant_slug', { required: true })}
              className="input mt-1"
              autoComplete="organization"
            />
            {errors.tenant_slug && <p className="mt-1 text-xs text-red-600">Required</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-ink-subtle">Email</label>
            <input
              type="email"
              {...register('email', { required: true })}
              className="input mt-1"
              autoComplete="email"
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">Required</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-ink-subtle">Password</label>
            <input
              type="password"
              {...register('password', { required: true })}
              className="input mt-1"
              autoComplete="current-password"
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">Required</p>}
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full justify-center">
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="mt-4 text-xs text-ink-muted text-center">
          Local dev: try <span className="font-mono">DevPassword1234!</span>
        </div>
      </div>
    </div>
  );
}

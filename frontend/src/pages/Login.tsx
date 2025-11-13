import React, { useState } from 'react';
import { login, fetchMe } from '../lib/api';
import TextCaptcha from '../components/TextCaptcha';


export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
	const [auth, setAuth] = useState({ username: '', password: '' });
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [captchaId, setCaptchaId] = useState<string>('');
	const [captchaAnswer, setCaptchaAnswer] = useState<string>('');

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (!captchaId || !captchaAnswer) {
			setError('Please complete the CAPTCHA verification');
			return;
		}
		setLoading(true);
		try {
			await login(auth.username, auth.password, captchaId, captchaAnswer);
			await fetchMe();
			onSuccess();
		} catch (e: any) {
			if (typeof e.message === 'string' && e.message.includes('CAPTCHA')) {
				setError(e.message);
			} else {
				setError(e.message);
			}
		} finally {
			setLoading(false);
		}
	}

	function handleCaptchaVerify(id: string, answer: string) {
		setCaptchaId(id);
		setCaptchaAnswer(answer);
		setError(null);
	}

	return (
		<div className="min-h-screen flex items-center justify-center relative auth-bg">
			{/* Dark overlay */}
			<div className="absolute inset-0 auth-overlay" />
			<div className="relative z-10 w-full max-w-md mx-auto p-8 sm:p-10 glass-card rounded-2xl">
				<form onSubmit={handleSubmit} className="w-full flex flex-col gap-6">
					<h2 className="text-3xl font-bold text-white tracking-tight text-center">Sign In</h2>
					<div className="flex flex-col gap-2">
						<label className="text-sm text-white/90 font-medium">E-MAIL ADDRESS</label>
						<input
							className="rounded-lg px-4 py-3 border border-white/20 focus:border-white/40 focus:ring-2 focus:ring-white/20 outline-none bg-white/90 text-gray-900 placeholder:text-gray-500"
							placeholder="Enter your email"
							type="text"
							value={auth.username}
							onChange={e => setAuth({ ...auth, username: e.target.value })}
							autoComplete="username"
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label className="text-sm text-white/90 font-medium">PASSWORD</label>
						<input
							type="password"
							className="rounded-lg px-4 py-3 border border-white/20 focus:border-white/40 focus:ring-2 focus:ring-white/20 outline-none bg-white/90 text-gray-900 placeholder:text-gray-500"
							placeholder="Enter your password"
							value={auth.password}
							onChange={e => setAuth({ ...auth, password: e.target.value })}
							autoComplete="current-password"
							required
						/>
					</div>
					<TextCaptcha
						onVerify={handleCaptchaVerify}
						onError={(err) => setError(err)}
					/>
					<button
						className="w-full rounded-lg px-4 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-60 shadow-md"
						disabled={loading || !captchaId || !captchaAnswer}
						type="submit"
					>
						{loading ? 'Signing in…' : 'Sign In'}
					</button>
					{error && <div className="text-red-300 text-center text-sm">{error}</div>}
					<div className="flex justify-between items-center mt-2 text-white/90">
						<a className="text-sm hover:underline" href="/forgot-password">Forgot password?</a>
						<a className="text-sm hover:underline" href="/signup">Sign Up</a>
					</div>
				</form>
			</div>
		</div>
	);
}



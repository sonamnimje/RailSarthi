import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface TextCaptchaProps {
	onVerify: (captchaId: string, captchaAnswer: string) => void;
	onError?: (error: string) => void;
}

export default function TextCaptcha({ onVerify, onError }: TextCaptchaProps) {
	const [captchaId, setCaptchaId] = useState<string>('');
	const [captchaText, setCaptchaText] = useState<string>('');
	const [userInput, setUserInput] = useState<string>('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchCaptcha = async () => {
		setLoading(true);
		setError(null);
		// Clear previous CAPTCHA state
		setCaptchaId('');
		setUserInput('');
		onVerify('', ''); // Clear parent state
		try {
			const API_BASE = ((import.meta as any).env?.VITE_API_URL || '').trim();
			const apiBaseUrl = API_BASE
				? API_BASE
				: (typeof location !== 'undefined'
						? ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
								? `${location.protocol}//${location.hostname}:8000`
								: 'https://railanukriti.onrender.com')
						: 'https://railanukriti.onrender.com');

			const res = await fetch(`${apiBaseUrl}/api/users/captcha`);
			if (!res.ok) {
				throw new Error('Failed to fetch CAPTCHA');
			}
			const data = await res.json() as { captcha_id: string; captcha_text: string };
			setCaptchaId(data.captcha_id);
			setCaptchaText(data.captcha_text);
			setUserInput('');
		} catch (err: any) {
			const errorMsg = err.message || 'Failed to load CAPTCHA';
			setError(errorMsg);
			if (onError) {
				onError(errorMsg);
			}
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchCaptcha();
	}, []);

	const handleSubmit = () => {
		if (!userInput.trim()) {
			setError('Please enter the CAPTCHA text');
			return;
		}
		if (!captchaId) {
			setError('CAPTCHA not loaded. Please refresh.');
			return;
		}
		onVerify(captchaId, userInput.trim());
	};

	return (
		<div className="flex flex-col gap-2">
			<label className="text-sm text-white/90 font-medium">CAPTCHA VERIFICATION</label>
			<div className="flex items-center gap-3">
				<div className="flex-1 flex items-center gap-3 bg-white/90 rounded-lg px-4 py-3 border border-white/20">
					<div className="flex-shrink-0">
						{loading ? (
							<div className="w-24 h-10 bg-gray-200 rounded flex items-center justify-center">
								<span className="text-xs text-gray-500">Loading...</span>
							</div>
						) : captchaText ? (
							<div className="w-24 h-10 bg-gradient-to-r from-blue-100 to-purple-100 rounded border-2 border-gray-300 flex items-center justify-center">
								<span className="text-2xl font-bold text-gray-800 tracking-wider select-none">
									{captchaText}
								</span>
							</div>
						) : (
							<div className="w-24 h-10 bg-gray-200 rounded flex items-center justify-center">
								<span className="text-xs text-gray-500">Error</span>
							</div>
						)}
					</div>
					<button
						type="button"
						onClick={fetchCaptcha}
						disabled={loading}
						className="text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors p-1 rounded hover:bg-blue-50"
						aria-label="Refresh CAPTCHA"
					>
						<RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
					</button>
					<input
						type="text"
						value={userInput}
						onChange={(e) => {
							const newValue = e.target.value.toUpperCase();
							setUserInput(newValue);
							setError(null);
							// Automatically verify when user enters 5 characters
							if (newValue.length === 5 && captchaId && newValue.trim()) {
								onVerify(captchaId, newValue.trim());
							}
						}}
						onBlur={() => {
							// Also verify on blur if we have 5 characters
							if (userInput.length === 5 && captchaId && userInput.trim()) {
								onVerify(captchaId, userInput.trim());
							}
						}}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								handleSubmit();
							}
						}}
						placeholder="Enter CAPTCHA"
						className="flex-1 bg-transparent border-none outline-none text-gray-900 placeholder:text-gray-500 text-sm font-mono"
						maxLength={5}
						autoComplete="off"
					/>
				</div>
			</div>
			{error && (
				<div className="text-red-300 text-sm">{error}</div>
			)}
			<div className="text-xs text-white/70">
				Enter the 5 characters shown above (case-insensitive)
			</div>
		</div>
	);
}


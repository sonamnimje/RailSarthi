import React, { useState, useMemo } from "react";

interface PasswordGuideProps {
	value: string;
	onChange: (value: string) => void;
	name?: string;
	id?: string;
	userEmail?: string;
	userName?: string;
}

export default function PasswordGuide({ 
	value, 
	onChange, 
	name = "password", 
	id = "password",
	userEmail,
	userName
}: PasswordGuideProps) {
	const [show, setShow] = useState(false);

	// Validation functions
	const checks = useMemo(() => ([
		{
			id: "length",
			label: "At least 12 characters",
			test: (pw: string) => pw.length >= 12,
		},
		{
			id: "upper",
			label: "At least one uppercase letter (A–Z)",
			test: (pw: string) => /[A-Z]/.test(pw),
		},
		{
			id: "lower",
			label: "At least one lowercase letter (a–z)",
			test: (pw: string) => /[a-z]/.test(pw),
		},
		{
			id: "digit",
			label: "At least one number (0–9)",
			test: (pw: string) => /[0-9]/.test(pw),
		},
		{
			id: "special",
			label: "At least one special character (!@#$%^&*()_-+=)",
			test: (pw: string) => /[!@#$%^&*()_\-+=\[{\]};:'",.<>/?\\|`~]/.test(pw),
		},
		{
			id: "not-common",
			label: "Not a common password (e.g. password, 123456)",
			test: (pw: string) => {
				if (!pw) return false;
				const common = ["password", "123456", "qwerty", "admin", "letmein", "iloveyou", "123456789", "111111", "password1", "12345678"];
				return !common.includes(pw.toLowerCase());
			}
		},
		{
			id: "not-similar",
			label: "Not similar to name/email",
			test: (pw: string) => {
				if (!pw || (!userEmail && !userName)) return true; // Skip if no user info
				const pwLower = pw.toLowerCase();
				if (userEmail) {
					const emailPrefix = userEmail.split('@')[0].toLowerCase();
					if (emailPrefix.length >= 3 && pwLower.includes(emailPrefix)) return false;
				}
				if (userName) {
					const nameLower = userName.toLowerCase();
					if (nameLower.length >= 3 && pwLower.includes(nameLower)) return false;
				}
				return true;
			}
		}
	]), [userEmail, userName]);

	const passed = checks.map(ch => ch.test(value));
	const passCount = passed.filter(Boolean).length;

	// Basic strength meter: 0-100
	const strength = Math.min(100, Math.round((passCount / checks.length) * 100 + (Math.min(value.length, 20) - 12) * 2));

	// Color helper
	const strengthLabel = strength < 34 ? "Weak" : strength < 67 ? "Medium" : "Strong";
	const strengthColor = strength < 34 ? "bg-red-400" : strength < 67 ? "bg-yellow-400" : "bg-green-500";

	return (
		<div className="w-full">
			<label htmlFor={id} className="block text-sm text-white/90 font-medium mb-2">PASSWORD</label>

			<div className="relative">
				<input
					id={id}
					name={name}
					type={show ? "text" : "password"}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					aria-describedby={`${id}-guide`}
					className="block w-full rounded-lg px-4 py-3 border border-white/20 focus:border-white/40 focus:ring-2 focus:ring-white/20 outline-none bg-white/90 text-gray-900 placeholder:text-gray-500 pr-20"
					autoComplete="new-password"
					placeholder="Enter your password"
				/>
				<button
					type="button"
					onClick={() => setShow(s => !s)}
					aria-label={show ? "Hide password" : "Show password"}
					className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-600 hover:text-gray-900 font-medium"
				>
					{show ? "Hide" : "Show"}
				</button>
			</div>

			{value && (
				<div id={`${id}-guide`} className="mt-3 bg-white/95 backdrop-blur-sm p-4 rounded-lg border border-white/20 text-sm shadow-lg">
					<div className="mb-3">
						<div className="flex items-center justify-between mb-2">
							<div className="text-xs font-semibold text-gray-700">
								Password strength: <span className="font-medium">{strengthLabel}</span>
							</div>
							<div className="text-xs text-gray-500">{strength}%</div>
						</div>
						<div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
							<div
								role="progressbar"
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={strength}
								className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
								style={{ width: `${strength}%` }}
							/>
						</div>
					</div>

					<ul className="space-y-1.5 text-sm">
						{checks.map((ch) => {
							const ok = ch.test(value);
							return (
								<li key={ch.id} className="flex items-start">
									<span 
										aria-hidden 
										className={`mr-2 mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-white text-xs flex-shrink-0 ${
											ok ? 'bg-green-500' : 'bg-gray-300'
										}`}
									>
										{ok ? "✓" : "✕"}
									</span>
									<span className={`${ok ? 'text-gray-700' : 'text-gray-500'}`}>
										{ch.label}
									</span>
								</li>
							);
						})}
					</ul>

					<div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
						💡 Tip: Use a passphrase (three random words) or a password manager to generate & store passwords securely.
					</div>
				</div>
			)}

			{!value && (
				<div className="mt-2 text-xs text-white/70">
					Password must be at least 12 characters and include uppercase, lowercase, number, and special character.
				</div>
			)}
		</div>
	);
}


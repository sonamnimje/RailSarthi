import React, { useState } from 'react';
import { signup, login, fetchMe } from '../lib/api';

const indianRailwayZones = [
	'Central Railway',
	'Eastern Railway',
	'East Central Railway',
	'East Coast Railway',
	'Northern Railway',
	'North Central Railway',
	'North Eastern Railway',
	'North Frontier Railway',
	'North Western Railway',
	'Southern Railway',
	'South Central Railway',
	'South Eastern Railway',
	'South East Central Railway',
	'South Western Railway',
	'Western Railway',
	'West Central Railway',
] as const;

const zoneToDivisions: Record<string, string[]> = {
	'Central Railway': ['Mumbai', 'Nagpur', 'Bhusawal', 'Pune', 'Sholapur'],
	'Eastern Railway': ['Howrah-I', 'Howrah-II', 'Sealdah', 'Malda', 'Asansol', 'Chitaranjan', 'Kolkata Metro'],
	'East Central Railway': ['Danapur', 'Mugalsarai', 'Dhanbad', 'Sonpur', 'Samastipur'],
	'East Coast Railway': ['Khurda Road', 'Waltair', 'Sambhalpur'],
	'Northern Railway': ['Delhi-I', 'Delhi-II', 'Ambala', 'Moradabad', 'Lucknow', 'Firozpur'],
	'North Central Railway': ['Allahabad', 'Jhansi', 'Agra'],
	'North Eastern Railway': ['Izzatnagar', 'Lucknow', 'Varanasi', 'DUW'],
	'North Frontier Railway': ['Katihar', 'Alipurduar', 'Rangiya', 'Lumding', 'Tinsukhia'],
	'North Western Railway': ['Jaipur', 'Jodhpur', 'Bikaner', 'Ajmer'],
	'Southern Railway': ['Chennai', 'Madurai', 'Palghat', 'Trichy', 'Trivendrum'],
	'South Central Railway': ['Secunderabad', 'Hyderabad', 'Guntakal', 'Vijayawada', 'Nanded'],
	'South Eastern Railway': ['Kharagpur', 'Adra', 'Chakradharpur', 'Ranchi', 'Shalimar'],
	'South East Central Railway': ['Bilaspur', 'Nagpur', 'Raipur'],
	'South Western Railway': ['Bangalore', 'Mysore', 'Hubli', 'RWF/YNK'],
	'Western Railway': ['BCT', 'Vadodara', 'Ahmedabad', 'Ratlam', 'Rajkot', 'Bhavnagar'],
	'West Central Railway': ['Jabalpur', 'Bhopal', 'Kota'],
};

export default function SignupPage({ onSuccess }: { onSuccess: () => void }) {
	const [form, setForm] = useState({
		name: '',
		email: '',
		password: '',
		confirm: '',
		role: 'controller' as 'controller' | 'admin',
		zone: '',
		zones: [] as string[], // For admin multi-select
		division: '',
		divisions: [] as string[], // For admin multi-select
	});
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
// Removed agree state for Terms & Conditions

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (form.password !== form.confirm) {
			setError('Passwords do not match');
			return;
		}
		if (form.role === 'admin') {
			if (form.zones.length === 0) {
				setError('Please select at least one zone');
				return;
			}
			if (form.divisions.length === 0) {
				setError('Please select at least one division');
				return;
			}
		} else {
			if (!form.zone) {
				setError('Please select your zone');
				return;
			}
			if (!form.division) {
				setError('Please select your division');
				return;
			}
		}
		setLoading(true);
		try {
			   await signup(form.email, form.password, form.role);
			   await login(form.email, form.password);
			   await fetchMe();
			   onSuccess();
		   } catch (e: any) {
			   // Show a friendly message if user already exists
			   if (typeof e.message === 'string' && e.message.includes('Username already exists')) {
				   setError('User already registered');
			   } else {
				   setError(e.message);
			   }
		   } finally {
			   setLoading(false);
		   }
	}

	return (
		<div className="min-h-screen flex items-center justify-center relative auth-bg">
			<div className="absolute inset-0 auth-overlay" />
			<div className="relative z-10 w-full max-w-md mx-auto p-8 sm:p-10 glass-card rounded-2xl">
				<form onSubmit={handleSubmit} className="w-full flex flex-col gap-6">
					<h2 className="text-3xl font-bold text-white tracking-tight text-center">Create your account</h2>
					<div className="flex flex-col gap-2">
						<label className="text-sm text-white/90 font-medium">NAME</label>
						<input
							className="rounded-lg px-4 py-3 border border-white/20 focus:border-white/40 focus:ring-2 focus:ring-white/20 outline-none bg-white/90 text-gray-900 placeholder:text-gray-500"
							placeholder="Enter your name"
							type="text"
							value={form.name}
							onChange={e => setForm({ ...form, name: e.target.value })}
							autoComplete="name"
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label className="text-sm text-white/90 font-medium">E-MAIL ADDRESS</label>
						<input
							className="rounded-lg px-4 py-3 border border-white/20 focus:border-white/40 focus:ring-2 focus:ring-white/20 outline-none bg-white/90 text-gray-900 placeholder:text-gray-500"
							placeholder="Enter your email"
							type="email"
							value={form.email}
							onChange={e => setForm({ ...form, email: e.target.value })}
							autoComplete="email"
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label className="text-sm text-white/90 font-medium">PASSWORD</label>
						<input
							type="password"
							className="rounded-lg px-4 py-3 border border-white/20 focus:border-white/40 focus:ring-2 focus:ring-white/20 outline-none bg-white/90 text-gray-900 placeholder:text-gray-500"
							placeholder="Enter your password"
							value={form.password}
							onChange={e => setForm({ ...form, password: e.target.value })}
							autoComplete="new-password"
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label className="text-sm text-white/90 font-medium">CONFIRM PASSWORD</label>
						<input
							type="password"
							className="rounded-lg px-4 py-3 border border-white/20 focus:border-white/40 focus:ring-2 focus:ring-white/20 outline-none bg-white/90 text-gray-900 placeholder:text-gray-500"
							placeholder="Confirm your password"
							value={form.confirm}
							onChange={e => setForm({ ...form, confirm: e.target.value })}
							autoComplete="new-password"
							required
						/>
					</div>
					<div className="flex flex-col gap-2">
						<label className="text-sm text-white/90 font-medium">ROLE</label>
						<select
							className="rounded-lg px-4 py-3 border border-white/20 focus:border-white/40 focus:ring-2 focus:ring-white/20 outline-none bg-white/90 text-gray-900"
							value={form.role}
							onChange={e => {
								const newRole = e.target.value as 'controller' | 'admin';
								setForm({ 
									...form, 
									role: newRole,
									zone: newRole === 'admin' ? '' : form.zone,
									zones: newRole === 'controller' ? [] : form.zones,
									division: newRole === 'admin' ? '' : form.division,
									divisions: newRole === 'controller' ? [] : form.divisions
								});
							}}
						>
							<option value="controller">Controller</option>
							<option value="admin">Admin</option>
						</select>
					</div>
					<div className="flex flex-col gap-2">
						<label className="text-sm text-white/90 font-medium">
							RAILWAY ZONE{form.role === 'admin' ? 'S (Select all applicable)' : ''}
						</label>
						{form.role === 'admin' ? (
							<div className="max-h-60 overflow-y-auto border border-white/20 rounded-lg bg-white/90 p-3 space-y-2">
								<div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-300">
									<input
										type="checkbox"
										id="select-all"
										checked={form.zones.length === indianRailwayZones.length}
									onChange={e => {
										if (e.target.checked) {
											setForm({ ...form, zones: [...indianRailwayZones] });
										} else {
											setForm({ ...form, zones: [], divisions: [] });
										}
									}}
										className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
									/>
									<label htmlFor="select-all" className="text-gray-900 font-medium cursor-pointer">
										Select All Zones
									</label>
								</div>
								{indianRailwayZones.map(zone => (
									<div key={zone} className="flex items-center gap-2">
										<input
											type="checkbox"
											id={`zone-${zone}`}
											checked={form.zones.includes(zone)}
										onChange={e => {
											if (e.target.checked) {
												setForm({ ...form, zones: [...form.zones, zone] });
											} else {
												const newZones = form.zones.filter(z => z !== zone);
												// Remove divisions that belong only to the deselected zone
												const divisionsInOtherZones = new Set<string>();
												newZones.forEach(z => {
													(zoneToDivisions[z] || []).forEach(d => divisionsInOtherZones.add(d));
												});
												const filteredDivisions = form.divisions.filter(d => divisionsInOtherZones.has(d));
												setForm({ ...form, zones: newZones, divisions: filteredDivisions });
											}
										}}
											className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
										/>
										<label htmlFor={`zone-${zone}`} className="text-gray-900 cursor-pointer">
											{zone}
										</label>
									</div>
								))}
							</div>
						) : (
							<select
								className="rounded-lg px-4 py-3 border border-white/20 focus:border-white/40 focus:ring-2 focus:ring-white/20 outline-none bg-white/90 text-gray-900"
								value={form.zone}
								onChange={e => setForm({ ...form, zone: e.target.value, division: '' })}
								required
							>
								<option value="" disabled>
									Select your zone
								</option>
								{indianRailwayZones.map(zone => (
									<option key={zone} value={zone}>
										{zone}
									</option>
								))}
							</select>
						)}
						{form.role === 'admin' && form.zones.length > 0 && (
							<p className="text-xs text-white/70 mt-1">
								{form.zones.length} zone{form.zones.length !== 1 ? 's' : ''} selected
							</p>
						)}
					</div>
					{/* Division Selection */}
					{((form.role === 'controller' && form.zone) || (form.role === 'admin' && form.zones.length > 0)) && (
						<div className="flex flex-col gap-2">
							<label className="text-sm text-white/90 font-medium">
								RAILWAY DIVISION{form.role === 'admin' ? 'S (Select all applicable)' : ''}
							</label>
							{form.role === 'admin' ? (
								<div className="max-h-60 overflow-y-auto border border-white/20 rounded-lg bg-white/90 p-3 space-y-2">
									{form.zones.map(zone => {
										const divisions = zoneToDivisions[zone] || [];
										return (
											<div key={zone} className="mb-4 last:mb-0">
												<p className="text-sm font-semibold text-gray-900 mb-2 pb-1 border-b border-gray-300">
													{zone}
												</p>
												{divisions.map(division => (
													<div key={`${zone}-${division}`} className="flex items-center gap-2 ml-2">
														<input
															type="checkbox"
															id={`division-${zone}-${division}`}
															checked={form.divisions.includes(division)}
															onChange={e => {
																if (e.target.checked) {
																	if (!form.divisions.includes(division)) {
																		setForm({ ...form, divisions: [...form.divisions, division] });
																	}
																} else {
																	setForm({ ...form, divisions: form.divisions.filter(d => d !== division) });
																}
															}}
															className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
														/>
														<label htmlFor={`division-${zone}-${division}`} className="text-gray-900 cursor-pointer">
															{division}
														</label>
													</div>
												))}
											</div>
										);
									})}
								</div>
							) : (
								<select
									className="rounded-lg px-4 py-3 border border-white/20 focus:border-white/40 focus:ring-2 focus:ring-white/20 outline-none bg-white/90 text-gray-900"
									value={form.division}
									onChange={e => setForm({ ...form, division: e.target.value })}
									required
								>
									<option value="" disabled>
										Select your division
									</option>
									{(zoneToDivisions[form.zone] || []).map(division => (
										<option key={division} value={division}>
											{division}
										</option>
									))}
								</select>
							)}
							{form.role === 'admin' && form.divisions.length > 0 && (
								<p className="text-xs text-white/70 mt-1">
									{form.divisions.length} division{form.divisions.length !== 1 ? 's' : ''} selected
								</p>
							)}
						</div>
					)}
					<button
						className="w-full rounded-lg px-4 py-3 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-60 shadow-md"
						disabled={loading}
						type="submit"
					>
						{loading ? 'Signing up…' : 'Sign Up'}
					</button>
					{error && <div className="text-red-300 text-center text-sm">{error}</div>}
					<div className="text-center mt-2">
						<a className="text-white/90 text-sm hover:underline" href="/login">Already have an account?</a>
					</div>
				</form>
			</div>
		</div>
	);
	}

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, Key, LogOut, RefreshCw } from 'lucide-react';
import { api } from '../../../utils/fetcher';
import { signup } from '../../../lib/api';
import { INDIAN_RAILWAY_ZONES, ZONE_TO_DIVISIONS } from '../../../lib/zoneData';

interface User {
	id: number;
	username: string;
	role: 'admin' | 'controller' | 'viewer';
	divisions?: string[];
	created_at?: string;
}

export default function AccessControl() {
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(false);
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [newUser, setNewUser] = useState({
		username: '',
		password: '',
		role: 'controller' as 'admin' | 'controller' | 'viewer',
		zones: [] as string[],
		divisions: [] as string[],
	});
	const [captchaId, setCaptchaId] = useState('');
	const [captchaText, setCaptchaText] = useState('');
	const [captchaAnswer, setCaptchaAnswer] = useState('');
	const [captchaLoading, setCaptchaLoading] = useState(false);

	const fetchCaptcha = useCallback(async () => {
		setCaptchaLoading(true);
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
			if (!res.ok) throw new Error('Failed to fetch CAPTCHA');
			const data = await res.json() as { captcha_id: string; captcha_text: string };
			setCaptchaId(data.captcha_id);
			setCaptchaText(data.captcha_text);
			setCaptchaAnswer('');
		} catch (err: any) {
			console.error('CAPTCHA error:', err);
		} finally {
			setCaptchaLoading(false);
		}
	}, []);

	useEffect(() => {
		loadUsers();
		fetchCaptcha();
	}, [fetchCaptcha]);

	const loadUsers = async () => {
		try {
			const data = await api.get<User[]>('/api/admin/users');
			setUsers(data);
		} catch (error) {
			console.error('Failed to load users:', error);
		}
	};

	const handleCreateUser = async () => {
		if (!newUser.username || !newUser.password || !captchaId || !captchaAnswer) {
			return { success: false, message: 'Please fill all fields and complete CAPTCHA' };
		}
		if (newUser.role === 'controller' && newUser.zones.length === 0) {
			return { success: false, message: 'Please select a zone' };
		}
		if (newUser.role === 'controller' && newUser.divisions.length === 0) {
			return { success: false, message: 'Please select at least one division' };
		}

		try {
			await signup(
				newUser.username,
				newUser.password,
				newUser.role === 'admin' ? 'admin' : 'controller',
				captchaId,
				captchaAnswer
			);
			setNewUser({ username: '', password: '', role: 'controller', zones: [], divisions: [] });
			setShowCreateForm(false);
			loadUsers();
			fetchCaptcha();
			return { success: true, message: 'User created successfully' };
		} catch (error: any) {
			return { success: false, message: error.message || 'Failed to create user' };
		}
	};

	const handleDeleteUser = async (userId: number) => {
		if (!confirm('Are you sure you want to delete this user?')) return;
		try {
			await api.delete(`/api/admin/users/${userId}`);
			loadUsers();
			return { success: true, message: 'User deleted successfully' };
		} catch (error: any) {
			return { success: false, message: error.message || 'Failed to delete user' };
		}
	};

	const handleResetPassword = async (userId: number) => {
		if (!confirm('Reset password for this user?')) return;
		try {
			await api.post(`/api/admin/reset-password`, { user_id: userId });
			return { success: true, message: 'Password reset email sent' };
		} catch (error: any) {
			return { success: false, message: error.message || 'Failed to reset password' };
		}
	};

	const handleRevokeSessions = async (userId: number) => {
		if (!confirm('Revoke all active sessions for this user?')) return;
		try {
			await api.post(`/api/admin/revoke-sessions`, { user_id: userId });
			return { success: true, message: 'Sessions revoked successfully' };
		} catch (error: any) {
			return { success: false, message: error.message || 'Failed to revoke sessions' };
		}
	};


	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-3">
					<Users className="w-6 h-6 text-blue-600" />
					<h2 className="text-2xl font-bold text-gray-900">Access Control</h2>
				</div>
				<button
					onClick={() => setShowCreateForm(!showCreateForm)}
					className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
				>
					<Plus className="w-4 h-4" />
					Create User
				</button>
			</div>

			{/* Create User Form */}
			{showCreateForm && (
				<div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
					<h3 className="text-lg font-semibold text-gray-900 mb-4">Create New User</h3>
					
					{/* Basic Information - 2 column grid */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
							<input
								type="text"
								value={newUser.username}
								onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
								className="w-full border rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
							<input
								type="password"
								value={newUser.password}
								onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
								className="w-full border rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
							<select
								value={newUser.role}
								onChange={(e) => {
									const newRole = e.target.value as 'admin' | 'controller' | 'viewer';
									// Reset zones and divisions when role changes
									setNewUser({ ...newUser, role: newRole, zones: [], divisions: [] });
								}}
								className="w-full border rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
							>
								<option value="viewer">Viewer</option>
								<option value="controller">Controller</option>
								<option value="admin">Admin</option>
							</select>
						</div>
					</div>

					{/* Zone Selection - Show first when role is controller (only one zone allowed) */}
					{newUser.role === 'controller' && (
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">Zone</label>
							<select
								value={newUser.zones[0] || ''}
								onChange={(e) => {
									const selectedZone = e.target.value;
									if (selectedZone) {
										// Clear divisions when zone changes
										setNewUser({ ...newUser, zones: [selectedZone], divisions: [] });
									} else {
										setNewUser({ ...newUser, zones: [], divisions: [] });
									}
								}}
								className="w-full border rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300"
							>
								<option value="">Select a zone</option>
								{INDIAN_RAILWAY_ZONES.map((zone) => (
									<option key={zone} value={zone}>
										{zone}
									</option>
								))}
							</select>
						</div>
					)}

					{/* Division Selection - Show after zone is selected for controller */}
					{newUser.role === 'controller' && newUser.zones.length > 0 && (
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">Divisions</label>
							<div className="max-h-60 overflow-y-auto border border-gray-300 rounded-lg p-3 space-y-2">
								{newUser.zones[0] && (() => {
									const selectedZone = newUser.zones[0];
									const divisions = ZONE_TO_DIVISIONS[selectedZone as keyof typeof ZONE_TO_DIVISIONS] || [];
									return (
										<div>
											<p className="text-sm font-semibold text-gray-900 mb-2 pb-1 border-b border-gray-300">
												{selectedZone}
											</p>
											{divisions.map(division => (
												<label key={`${selectedZone}-${division}`} className="flex items-center gap-2 ml-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
													<input
														type="checkbox"
														checked={newUser.divisions.includes(division)}
														onChange={(e) => {
															if (e.target.checked) {
																setNewUser({ ...newUser, divisions: [...newUser.divisions, division] });
															} else {
																setNewUser({ ...newUser, divisions: newUser.divisions.filter(d => d !== division) });
															}
														}}
														className="w-4 h-4 text-blue-600 rounded"
													/>
													<span className="text-sm text-gray-700">{division}</span>
												</label>
											))}
										</div>
									);
								})()}
							</div>
						</div>
					)}

					{/* For admin and viewer roles, show all divisions directly */}
					{newUser.role !== 'controller' && (
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">Divisions</label>
							<div className="max-h-60 overflow-y-auto border border-gray-300 rounded-lg p-3 space-y-2">
								{INDIAN_RAILWAY_ZONES.map(zone => {
									const divisions = ZONE_TO_DIVISIONS[zone as keyof typeof ZONE_TO_DIVISIONS] || [];
									return (
										<div key={zone} className="mb-4 last:mb-0">
											<p className="text-sm font-semibold text-gray-900 mb-2 pb-1 border-b border-gray-300">
												{zone}
											</p>
											{divisions.map(division => (
												<label key={`${zone}-${division}`} className="flex items-center gap-2 ml-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
													<input
														type="checkbox"
														checked={newUser.divisions.includes(division)}
														onChange={(e) => {
															if (e.target.checked) {
																setNewUser({ ...newUser, divisions: [...newUser.divisions, division] });
															} else {
																setNewUser({ ...newUser, divisions: newUser.divisions.filter(d => d !== division) });
															}
														}}
														className="w-4 h-4 text-blue-600 rounded"
													/>
													<span className="text-sm text-gray-700">{division}</span>
												</label>
											))}
										</div>
									);
								})}
							</div>
						</div>
					)}

					{/* CAPTCHA Section */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-2">CAPTCHA</label>
						<div className="flex items-center gap-3">
							{captchaLoading ? (
								<div className="w-24 h-10 bg-gray-200 rounded flex items-center justify-center">
									<span className="text-xs">Loading...</span>
								</div>
							) : captchaText ? (
								<div className="w-24 h-10 bg-gradient-to-r from-blue-100 to-purple-100 rounded border-2 border-gray-300 flex items-center justify-center">
									<span className="text-2xl font-bold text-gray-800">{captchaText}</span>
								</div>
							) : null}
							<button
								type="button"
								onClick={fetchCaptcha}
								className="text-blue-600 hover:text-blue-800 transition-colors"
							>
								<RefreshCw className="w-4 h-4" />
							</button>
							<input
								type="text"
								value={captchaAnswer}
								onChange={(e) => setCaptchaAnswer(e.target.value.toUpperCase())}
								placeholder="Enter CAPTCHA"
								className="flex-1 border rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 border-gray-300 font-mono"
								maxLength={5}
							/>
						</div>
					</div>

					{/* Action Buttons */}
					<div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200">
						<button
							onClick={() => {
								setShowCreateForm(false);
								setNewUser({ username: '', password: '', role: 'controller', zones: [], divisions: [] });
							}}
							className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
						>
							Cancel
						</button>
						<button
							onClick={handleCreateUser}
							className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
						>
							Create
						</button>
					</div>
				</div>
			)}

			{/* Users List */}
			<div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Username</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Role</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Divisions</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-200">
							{users.map((user) => (
								<tr key={user.id} className="hover:bg-gray-50">
									<td className="px-4 py-3 text-sm text-gray-900">{user.username}</td>
									<td className="px-4 py-3">
										<span className={`px-2 py-1 text-xs font-medium rounded ${
											user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
											user.role === 'controller' ? 'bg-blue-100 text-blue-800' :
											'bg-gray-100 text-gray-800'
										}`}>
											{user.role}
										</span>
									</td>
									<td className="px-4 py-3 text-sm text-gray-600">
										{user.divisions?.join(', ') || 'All'}
									</td>
									<td className="px-4 py-3">
										<div className="flex items-center gap-2">
											<button
												onClick={() => handleResetPassword(user.id)}
												className="p-1 text-blue-600 hover:text-blue-800"
												title="Reset Password"
											>
												<Key className="w-4 h-4" />
											</button>
											<button
												onClick={() => handleRevokeSessions(user.id)}
												className="p-1 text-orange-600 hover:text-orange-800"
												title="Revoke Sessions"
											>
												<LogOut className="w-4 h-4" />
											</button>
											<button
												onClick={() => handleDeleteUser(user.id)}
												className="p-1 text-red-600 hover:text-red-800"
												title="Delete User"
											>
												<Trash2 className="w-4 h-4" />
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}


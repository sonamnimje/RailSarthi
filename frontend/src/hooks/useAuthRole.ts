import { useState, useEffect } from 'react';
import { fetchMe } from '../lib/api';

export type UserRole = 'admin' | 'controller' | 'viewer';

export interface User {
	id: number;
	username: string;
	role: UserRole;
}

export function useAuthRole() {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const loadUser = async () => {
			try {
				setLoading(true);
				setError(null);
				const token = localStorage.getItem('token');
				if (!token) {
					setUser(null);
					return;
				}
				const userData = await fetchMe();
				setUser(userData as User);
			} catch (err: any) {
				setError(err.message || 'Failed to load user');
				setUser(null);
			} finally {
				setLoading(false);
			}
		};

		loadUser();
	}, []);

	const isAdmin = user?.role === 'admin';
	const isController = user?.role === 'controller';
	const isViewer = user?.role === 'viewer';
	const hasRole = (role: UserRole) => user?.role === role;

	return {
		user,
		loading,
		error,
		isAdmin,
		isController,
		isViewer,
		hasRole,
	};
}


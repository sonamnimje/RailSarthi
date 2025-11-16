import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthRole } from '../../hooks/useAuthRole';

interface ProtectedAdminRouteProps {
	children: React.ReactNode;
}

export default function ProtectedAdminRoute({ children }: ProtectedAdminRouteProps) {
	const { user, loading, isAdmin } = useAuthRole();
	const [isChecking, setIsChecking] = useState(true);

	useEffect(() => {
		if (!loading) {
			setIsChecking(false);
		}
	}, [loading]);

	if (isChecking || loading) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-blue-50">
				<div className="text-center">
					<div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
					<p className="text-gray-600">Checking permissions...</p>
				</div>
			</div>
		);
	}

	if (!user || !isAdmin) {
		return <Navigate to="/unauthorized" replace />;
	}

	return <>{children}</>;
}


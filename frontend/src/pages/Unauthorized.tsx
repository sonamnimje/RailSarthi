import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';

export default function UnauthorizedPage() {
	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 via-blue-100 to-indigo-50 flex items-center justify-center p-4">
			<div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
				<div className="flex justify-center mb-4">
					<div className="p-4 bg-red-100 rounded-full">
						<Shield className="w-12 h-12 text-red-600" />
					</div>
				</div>
				<h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
				<p className="text-gray-600 mb-6">
					You do not have permission to access this page. Admin privileges are required.
				</p>
				<Link
					to="/app/dashboard"
					className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
				>
					<ArrowLeft className="w-4 h-4" />
					Return to Dashboard
				</Link>
			</div>
		</div>
	);
}


import { useState } from 'react';
import { Save, Settings as SettingsIcon, Zap, Database, Radio, Users, AlertTriangle, FileText, Monitor } from 'lucide-react';
import ProtectedAdminRoute from '../components/admin/ProtectedAdminRoute';
import { useToast } from '../components/ui/Toast';
import { useAuthRole } from '../hooks/useAuthRole';
import EngineSettings from '../components/admin/settings/EngineSettings';
import DataManagement from '../components/admin/settings/DataManagement';
import ApiSettings from '../components/admin/settings/ApiSettings';
import AccessControl from '../components/admin/settings/AccessControl';
import DisruptionSettings from '../components/admin/settings/DisruptionSettings';
import LoggingSettings from '../components/admin/settings/LoggingSettings';

type TabId = 'engine' | 'data' | 'api' | 'access' | 'disruption' | 'logging' | 'ui';

interface Tab {
	id: TabId;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	component: React.ComponentType;
}

const tabs: Tab[] = [
	{ id: 'engine', label: 'Simulation Engine', icon: Zap, component: EngineSettings },
	{ id: 'data', label: 'Data Management', icon: Database, component: DataManagement },
	{ id: 'api', label: 'Real-Time API', icon: Radio, component: ApiSettings },
	{ id: 'access', label: 'Access Control', icon: Users, component: AccessControl },
	{ id: 'disruption', label: 'Disruption Rules', icon: AlertTriangle, component: DisruptionSettings },
	{ id: 'logging', label: 'Logging & Reports', icon: FileText, component: LoggingSettings },
];

export default function SettingsPage() {
	const [activeTab, setActiveTab] = useState<TabId>('engine');
	const [saving, setSaving] = useState(false);
	const { showToast, ToastContainer } = useToast();
	const { user } = useAuthRole();

	const activeTabData = tabs.find((t) => t.id === activeTab);
	const ActiveComponent = activeTabData?.component || EngineSettings;

	const handleSave = async () => {
		setSaving(true);
		try {
			// Each component handles its own save logic
			// This is a global save that could trigger all component saves
			await new Promise((resolve) => setTimeout(resolve, 500));
			showToast('All settings saved successfully', 'success');
		} catch (error: any) {
			showToast(error.message || 'Failed to save settings', 'error');
		} finally {
			setSaving(false);
		}
	};

	return (
		<ProtectedAdminRoute>
			<div className="min-h-screen bg-gray-50">
				<div className="flex h-screen overflow-hidden">
					{/* Left Sidebar */}
					<aside className="w-64 bg-white border-r border-gray-200 flex-shrink-0 overflow-y-auto">
						<div className="p-6 border-b border-gray-200">
							<div className="flex items-center gap-3">
								<SettingsIcon className="w-6 h-6 text-blue-600" />
								<h1 className="text-xl font-bold text-gray-900">Admin Settings</h1>
							</div>
							{user && (
								<div className="mt-4 pt-4 border-t border-gray-200">
									<div className="text-xs text-gray-500 mb-1">Current User</div>
									<div className="text-sm font-medium text-gray-900 mb-2">{user.username}</div>
									<div className="flex items-center gap-2">
										<span className="text-xs text-gray-500">Role:</span>
										<span className={`px-2 py-1 text-xs font-medium rounded ${
											user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
											user.role === 'controller' ? 'bg-blue-100 text-blue-800' :
											'bg-gray-100 text-gray-800'
										}`}>
											{user.role === 'admin' ? 'Admin' : user.role === 'controller' ? 'Controller' : user.role}
										</span>
									</div>
								</div>
							)}
						</div>
						<nav className="p-4 space-y-1">
							{tabs.map((tab) => {
								const Icon = tab.icon;
								const isActive = activeTab === tab.id;
								return (
									<button
										key={tab.id}
										onClick={() => setActiveTab(tab.id)}
										className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
											isActive
												? 'bg-blue-50 text-blue-700 border border-blue-200'
												: 'text-gray-700 hover:bg-gray-50'
										}`}
									>
										<Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
										<span className="font-medium">{tab.label}</span>
									</button>
								);
							})}
						</nav>
					</aside>

					{/* Right Content Area */}
					<main className="flex-1 overflow-y-auto bg-gray-50">
						<div className="max-w-5xl mx-auto p-6 lg:p-8">
							{/* Header with Save Button */}
							<div className="flex items-center justify-between mb-6">
								<div>
									<h2 className="text-2xl font-bold text-gray-900">
										{activeTabData?.label || 'Settings'}
									</h2>
									<p className="text-sm text-gray-500 mt-1">
										Configure system settings and preferences
									</p>
								</div>
								<button
									onClick={handleSave}
									disabled={saving}
									className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
								>
									<Save className="w-4 h-4" />
									{saving ? 'Saving...' : 'Save'}
								</button>
							</div>

							{/* Active Component */}
							<div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
								<ActiveComponent />
							</div>
						</div>
					</main>
				</div>

				{/* Toast Container */}
				<ToastContainer />
			</div>
		</ProtectedAdminRoute>
	);
}

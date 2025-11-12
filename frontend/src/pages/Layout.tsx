import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import NotificationsPage from './Notifications'

export default function Layout() {
	const navigate = useNavigate()
	const bgClass = 'bg-white'
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
	const navItems = [
		{ to: '/app/dashboard', label: 'Dashboard' },
		{ to: '/app/logs', label: 'Logs' },
		{ to: '/app/simulation', label: 'Simulation' },
		{ to: '/app/overrides', label: 'Overrides' },
		{ to: '/app/reports', label: 'Reports' },
		{ to: '/app/settings', label: 'Settings' },
	]

	function signOut() {
		localStorage.removeItem('token')
		navigate('/login')
		setIsMenuOpen(false)
	}

	function handleNavClick() {
		setIsMenuOpen(false)
	}

	return (
		<div className={`min-h-screen ${bgClass}`}>
			<header className="sticky top-0 z-30 bg-white/90 backdrop-blur shadow-sm">
				<div className="mx-auto flex max-w-9xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
					<Link to="/" className="flex items-center gap-3" onClick={handleNavClick}>
						<img 
							src="/irctc.png" 
							alt="IRCTC Logo" 
							className="h-10 w-auto sm:h-12 object-contain"
						/>
						<span className="text-4xl font-black tracking-tight text-blue-800 sm:text-5xl" style={{ color: '#191970' }}>RailAnukriti</span>
					</Link>
					<nav className="hidden items-center gap-2 rounded-full bg-blue-50 px-1.5 py-1 text-3xl font-semibold text-blue-800 shadow-inner md:flex">
						{navItems.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								onClick={handleNavClick}
								className={({ isActive }) =>
									[
										'rounded-full px-3 py-1.5 transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
										isActive ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-blue-100 hover:text-blue-900',
									].join(' ')
								}
							>
								{item.label}
							</NavLink>
						))}
					</nav>
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="inline-flex items-center justify-center rounded-lg border border-blue-100 bg-white p-2 text-blue-700 shadow-sm transition hover:bg-blue-50 hover:text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 md:hidden"
							onClick={() => setIsMenuOpen((prev) => !prev)}
							aria-label="Toggle navigation"
							aria-expanded={isMenuOpen}
						>
							{isMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
						</button>
						<button
							type="button"
							onClick={() => setIsNotificationsOpen(true)}
							className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white border border-blue-200 shadow-sm transition-all duration-200 hover:bg-blue-50 hover:border-blue-400 hover:shadow-md hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 cursor-pointer"
							aria-label="Notifications"
						>
							<img src="/bell.png" alt="Notifications" className="h-10 w-10 transition-transform duration-200 hover:scale-110" />
						</button>
						<button
							type="button"
							className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-all duration-200 hover:bg-blue-700 hover:shadow-xl hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 cursor-pointer"
							onClick={signOut}
							aria-label="Log out"
						>
							<LogOut className="h-5 w-5 transition-transform duration-200 hover:rotate-12" aria-hidden="true" />
						</button>
					</div>
				</div>
				<nav
					className={`md:hidden ${isMenuOpen ? 'max-h-96 opacity-100' : 'pointer-events-none max-h-0 opacity-0'} origin-top bg-white text-blue-900 shadow-lg transition-all duration-200 ease-out`}
				>
					<div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 pb-4 pt-0 sm:px-6 lg:px-8">
						{navItems.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								onClick={handleNavClick}
								className={({ isActive }) =>
									[
										'rounded-xl px-3 py-2 text-xl font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
										isActive ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-blue-100 hover:text-blue-900',
									].join(' ')
								}
							>
								{item.label}
							</NavLink>
						))}
					</div>
				</nav>
			</header>
			<Outlet />
			
			{/* Notifications Side Panel */}
			{isNotificationsOpen && (
				<>
					{/* Backdrop */}
					<div
						className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
						onClick={() => setIsNotificationsOpen(false)}
					/>
					{/* Side Panel */}
					<div className="fixed top-0 right-0 h-full w-full md:w-1/2 lg:w-2/5 xl:w-1/3 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto">
						<div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
							<h2 className="text-2xl font-bold text-gray-800">🔔 Notifications</h2>
							<button
								type="button"
								onClick={() => setIsNotificationsOpen(false)}
								className="inline-flex items-center justify-center rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
								aria-label="Close notifications"
							>
								<X className="h-5 w-5" aria-hidden="true" />
							</button>
						</div>
						<div className="p-6">
							<NotificationsPage />
						</div>
					</div>
				</>
			)}
		</div>
	)
}



import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

export default function Layout() {
	const navigate = useNavigate()
	const isHome = window.location.pathname === "/"
	const isReports = window.location.pathname.startsWith('/app/reports')
	const bgClass = 'bg-white'
	function signOut() {
		localStorage.removeItem('token')
		navigate('/login')
	}
	return (
		<div className={`min-h-screen ${bgClass}`}>
			<header className="grid grid-cols-3 items-center p-4 rounded-b-2xl shadow-2xl bg-white">
				<div className="flex items-center">
					<Link to="/" className="flex items-center gap-2">
						<img src="/logo.png" alt="Logo" className="h-8 w-8 object-contain" />
						<span className="text-3xl font-bold text-blue-800">RailAnukriti(रेलअनुकृति)</span>
					</Link>
				</div>
				<nav className="flex items-center gap-4 text-lg justify-center">
					<NavLink to="/" end className={({ isActive }) => isActive ? 'font-bold bg-blue-600 text-white rounded px-3 py-2 shadow transition' : 'text-blue-700 hover:bg-blue-100 hover:text-blue-900 rounded px-3 py-2 transition'}>Home</NavLink>
					<NavLink to="/app/dashboard" className={({ isActive }) => isActive ? 'font-bold bg-blue-600 text-white rounded px-3 py-2 shadow transition' : 'text-blue-700 hover:bg-blue-100 hover:text-blue-900 rounded px-3 py-2 transition'}>Dashboard</NavLink>
					<NavLink to="/app/logs" className={({ isActive }) => isActive ? 'font-bold bg-blue-600 text-white rounded px-3 py-2 shadow transition' : 'text-blue-700 hover:bg-blue-100 hover:text-blue-900 rounded px-3 py-2 transition'}>Logs</NavLink>
					<NavLink to="/app/simulation" className={({ isActive }) => isActive ? 'font-bold bg-blue-600 text-white rounded px-3 py-2 shadow transition' : 'text-blue-700 hover:bg-blue-100 hover:text-blue-900 rounded px-3 py-2 transition'}>Simulation</NavLink>
					<NavLink to="/app/overrides" className={({ isActive }) => isActive ? 'font-bold bg-blue-600 text-white rounded px-3 py-2 shadow transition' : 'text-blue-700 hover:bg-blue-100 hover:text-blue-900 rounded px-3 py-2 transition'}>Overrides</NavLink>
					<NavLink to="/app/reports" className={({ isActive }) => isActive ? 'font-bold bg-blue-600 text-white rounded px-3 py-2 shadow transition' : 'text-blue-700 hover:bg-blue-100 hover:text-blue-900 rounded px-3 py-2 transition'}>Reports</NavLink>
					<NavLink to="/app/settings" className={({ isActive }) => isActive ? 'font-bold bg-blue-600 text-white rounded px-3 py-2 shadow transition' : 'text-blue-700 hover:bg-blue-100 hover:text-blue-900 rounded px-3 py-2 transition'}>Settings</NavLink>
				</nav>
				<div className="flex justify-end">
					<button className="ml-4 px-3 py-1 rounded-lg bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition" onClick={signOut}>Log out</button>
				</div>
			</header>
			<Outlet />
		</div>
	)
}



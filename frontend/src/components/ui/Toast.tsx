import { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration?: number;
}

interface ToastProps {
	toast: Toast;
	onClose: (id: string) => void;
}

export function ToastComponent({ toast, onClose }: ToastProps) {
	useEffect(() => {
		if (toast.duration !== 0) {
			const timer = setTimeout(() => {
				onClose(toast.id);
			}, toast.duration || 3000);

			return () => clearTimeout(timer);
		}
	}, [toast.id, toast.duration, onClose]);

	const icons = {
		success: CheckCircle2,
		error: AlertCircle,
		info: Info,
	};

	const styles = {
		success: 'bg-green-50 border-green-200 text-green-800',
		error: 'bg-red-50 border-red-200 text-red-800',
		info: 'bg-blue-50 border-blue-200 text-blue-800',
	};

	const Icon = icons[toast.type];

	return (
		<div
			className={`flex items-center gap-3 p-4 rounded-lg border shadow-lg min-w-[300px] max-w-md ${styles[toast.type]}`}
		>
			<Icon className="w-5 h-5 flex-shrink-0" />
			<p className="flex-1 text-sm font-medium">{toast.message}</p>
			<button
				onClick={() => onClose(toast.id)}
				className="flex-shrink-0 hover:opacity-70 transition-opacity"
				aria-label="Close"
			>
				<X className="w-4 h-4" />
			</button>
		</div>
	);
}

export function useToast() {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const showToast = (message: string, type: ToastType = 'info', duration = 3000) => {
		const id = Math.random().toString(36).substring(7);
		setToasts((prev) => [...prev, { id, message, type, duration }]);
	};

	const removeToast = (id: string) => {
		setToasts((prev) => prev.filter((toast) => toast.id !== id));
	};

	const ToastContainer = () => (
		<div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
			{toasts.map((toast) => (
				<ToastComponent key={toast.id} toast={toast} onClose={removeToast} />
			))}
		</div>
	);

	return { showToast, ToastContainer };
}


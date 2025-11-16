const API_BASE = ((import.meta as any).env?.VITE_API_URL || '').trim();
const apiBaseUrl = API_BASE
	? API_BASE
	: (typeof location !== 'undefined'
			? ((location.hostname === 'localhost' || location.hostname === '127.0.0.1')
					? `${location.protocol}//${location.hostname}:8000`
					: 'https://railanukriti.onrender.com')
			: 'https://railanukriti.onrender.com');

export interface FetchOptions extends RequestInit {
	params?: Record<string, string | number | boolean>;
}

export async function fetcher<T = any>(
	endpoint: string,
	options: FetchOptions = {}
): Promise<T> {
	const { params, ...fetchOptions } = options;
	
	let url = `${apiBaseUrl}${endpoint}`;
	if (params) {
		const searchParams = new URLSearchParams();
		Object.entries(params).forEach(([key, value]) => {
			searchParams.append(key, String(value));
		});
		url += `?${searchParams.toString()}`;
	}

	const token = localStorage.getItem('token');
	const headers: HeadersInit = {
		'Content-Type': 'application/json',
		...fetchOptions.headers,
	};

	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	const response = await fetch(url, {
		...fetchOptions,
		headers,
	});

	if (!response.ok) {
		const errorText = await response.text();
		let errorMessage = `Request failed: ${response.status} ${response.statusText}`;
		
		try {
			const errorJson = JSON.parse(errorText);
			errorMessage = errorJson.detail || errorJson.message || errorMessage;
		} catch {
			errorMessage = errorText || errorMessage;
		}

		throw new Error(errorMessage);
	}

	if (response.status === 204) {
		return {} as T;
	}

	return response.json() as Promise<T>;
}

export const api = {
	get: <T = any>(endpoint: string, options?: FetchOptions) =>
		fetcher<T>(endpoint, { ...options, method: 'GET' }),
	
	post: <T = any>(endpoint: string, body?: any, options?: FetchOptions) =>
		fetcher<T>(endpoint, {
			...options,
			method: 'POST',
			body: body ? JSON.stringify(body) : undefined,
		}),
	
	patch: <T = any>(endpoint: string, body?: any, options?: FetchOptions) =>
		fetcher<T>(endpoint, {
			...options,
			method: 'PATCH',
			body: body ? JSON.stringify(body) : undefined,
		}),
	
	delete: <T = any>(endpoint: string, options?: FetchOptions) =>
		fetcher<T>(endpoint, { ...options, method: 'DELETE' }),
};


import { useEffect, useRef, useState } from 'react';

interface UseWebSocketOptions {
	onMessage?: (data: any) => void;
	onError?: (error: Event) => void;
	onOpen?: () => void;
	onClose?: () => void;
	reconnectInterval?: number;
	maxReconnectAttempts?: number;
}

export function useWebSocket(url: string | null, options: UseWebSocketOptions = {}) {
	const {
		onMessage,
		onError,
		onOpen,
		onClose,
		reconnectInterval = 3000,
		maxReconnectAttempts = 5,
	} = options;

	const [isConnected, setIsConnected] = useState(false);
	const [lastMessage, setLastMessage] = useState<any>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectAttemptsRef = useRef(0);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		if (!url) return;

		const connect = () => {
			try {
				const ws = new WebSocket(url);
				wsRef.current = ws;

				ws.onopen = () => {
					setIsConnected(true);
					reconnectAttemptsRef.current = 0;
					onOpen?.();
				};

				ws.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data);
						setLastMessage(data);
						onMessage?.(data);
					} catch (e) {
						// If not JSON, pass raw data
						setLastMessage(event.data);
						onMessage?.(event.data);
					}
				};

				ws.onerror = (error) => {
					onError?.(error);
				};

				ws.onclose = () => {
					setIsConnected(false);
					onClose?.();

					// Attempt to reconnect
					if (reconnectAttemptsRef.current < maxReconnectAttempts) {
						reconnectAttemptsRef.current += 1;
						reconnectTimeoutRef.current = setTimeout(() => {
							connect();
						}, reconnectInterval);
					}
				};
			} catch (error) {
				console.error('WebSocket connection error:', error);
			}
		};

		connect();

		return () => {
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
			}
			if (wsRef.current) {
				wsRef.current.close();
			}
		};
	}, [url, reconnectInterval, maxReconnectAttempts, onMessage, onError, onOpen, onClose]);

	const sendMessage = (message: any) => {
		if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
			wsRef.current.send(typeof message === 'string' ? message : JSON.stringify(message));
		}
	};

	return { isConnected, lastMessage, sendMessage };
}


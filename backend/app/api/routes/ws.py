from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Set, Dict, Any
import asyncio
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


class ConnectionManager:
	def __init__(self) -> None:
		self.active_connections: Set[WebSocket] = set()
		self.division_clients: Dict[str, Set[WebSocket]] = {}  # division -> set of websockets

	async def connect(self, websocket: WebSocket, division: str = "mumbai") -> None:
		# accept here if using manager.connect independently
		await websocket.accept()
		self.active_connections.add(websocket)
		
		division_lower = division.lower()
		if division_lower not in self.division_clients:
			self.division_clients[division_lower] = set()
		self.division_clients[division_lower].add(websocket)

	def disconnect(self, websocket: WebSocket, division: str = "mumbai") -> None:
		self.active_connections.discard(websocket)
		division_lower = division.lower()
		if division_lower in self.division_clients:
			self.division_clients[division_lower].discard(websocket)

	async def broadcast(self, message: str) -> None:
		for connection in list(self.active_connections):
			try:
				await connection.send_text(message)
			except Exception:
				self.disconnect(connection)
	
	async def broadcast_to_division(self, division: str, frame: Dict[str, Any]) -> None:
		"""Broadcast frame to all clients for a specific division"""
		division_lower = division.lower()
		clients = self.division_clients.get(division_lower, set())
		dead = []
		
		for ws in list(clients):
			try:
				await ws.send_json(frame)
			except Exception:
				dead.append(ws)
		
		for ws in dead:
			self.disconnect(ws, division_lower)


manager = ConnectionManager()


@router.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket) -> None:
	# Accept inside this handler because manager.connect also accepts in its implementation.
	await manager.connect(websocket)
	try:
		while True:
			await websocket.receive_text()
			# Echo for now; in production, push live train updates
			await websocket.send_text("pong")
	except WebSocketDisconnect:
		manager.disconnect(websocket)


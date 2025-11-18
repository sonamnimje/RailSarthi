from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Set, Dict, Any
import asyncio
import logging

from app.core.realtime_manager import fetch_live_positions, map_live_positions

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
	"""
	WebSocket endpoint for streaming live train positions.
	
	Continuously fetches live IRCTC data and maps it to geographic coordinates,
	then streams updates to connected clients every 2 seconds.
	
	Division can be passed as query parameter: ws://host/ws/live?division=mumbai
	"""
	await websocket.accept()
	
	# Get division from query string (WebSocket doesn't support Query() directly)
	division = "mumbai"  # Default
	try:
		query_string = websocket.url.query
		if query_string:
			params = dict(param.split('=') for param in query_string.split('&') if '=' in param)
			division = params.get('division', 'mumbai')
	except Exception:
		pass
	
	division_lower = division.lower().strip()
	logger.info(f"WebSocket connected for division: {division_lower}")
	
	try:
		while True:
			try:
				# 1. Try to pull live IRCTC data (may fail due to rate limiting)
				live_data = []
				rate_limited = False
				try:
					live_data = await fetch_live_positions(division_lower)
				except Exception as live_err:
					# Check if it's a rate limit error
					if "429" in str(live_err) or "rate limit" in str(live_err).lower():
						rate_limited = True
						logger.debug(f"Rate limited, skipping live data fetch: {live_err}")
					else:
						logger.debug(f"Failed to fetch live positions: {live_err}")
				
				# 2. Load division dataset to map trains to sections
				from app.services.division_loader import load_division_dataset, normalize_stations
				dataset = load_division_dataset(division_lower)
				sections_df = dataset.get("sections")
				sections_list = sections_df.to_dict('records') if sections_df is not None and not sections_df.empty else []
				
				# Build section map by from/to station codes
				section_map = {}
				for sec in sections_list:
					from_code = str(sec.get("from_station", "")).upper().strip()
					to_code = str(sec.get("to_station", "")).upper().strip()
					section_id = str(sec.get("section_id", ""))
					if from_code and to_code:
						key = f"{from_code}-{to_code}"
						section_map[key] = section_id
						# Also add reverse direction
						section_map[f"{to_code}-{from_code}"] = section_id
				
				# 3. Map live trains to section + progress format
				train_updates = []
				has_fallback_data = False
				
				# Try to get positions from digital twin endpoint first (fallback)
				try:
					from app.api.routes.digital_twin import get_digital_twin_positions
					fallback_response = await get_digital_twin_positions(division_lower)
					if fallback_response and fallback_response.get("trains"):
						has_fallback_data = True
						for train in fallback_response.get("trains", []):
							section_id = train.get("position", {}).get("sectionId", "")
							progress = train.get("position", {}).get("progress", 0.5)
							
							train_updates.append({
								"trainNo": train.get("trainNo", ""),
								"currentSection": section_id,
								"progress": max(0.0, min(1.0, progress))
							})
				except Exception as fallback_err:
					logger.debug(f"Fallback position fetch failed: {fallback_err}")
				
				# If no trains from fallback, try to map from live_data
				if not train_updates and live_data:
					for train_data in live_data:
						train_no = train_data.get("trainNo", "")
						current_station = train_data.get("current_station", "").upper().strip()
						next_station = train_data.get("next_station", "").upper().strip()
						
						# Find section
						section_id = ""
						progress = 0.5
						
						if current_station and next_station:
							key = f"{current_station}-{next_station}"
							section_id = section_map.get(key, "")
							if not section_id:
								# Try reverse
								key = f"{next_station}-{current_station}"
								section_id = section_map.get(key, "")
						
						# If still no section, use first section as fallback
						if not section_id and sections_list:
							section_id = str(sections_list[0].get("section_id", ""))
							progress = 0.0
						
						if section_id:
							train_updates.append({
								"trainNo": train_no,
								"currentSection": section_id,
								"progress": progress
							})
				
				# 4. Send JSON update (even if empty, to keep connection alive)
				await websocket.send_json({
					"type": "live_update",
					"division": division_lower,
					"trains": train_updates,
					"timestamp": asyncio.get_event_loop().time()
				})
				
				# Wait 1 second before next update (as per requirement)
				# If rate limited, wait longer to avoid hitting limit again
				wait_time = 1.0
				if rate_limited:
					wait_time = 10.0
				elif not train_updates and not has_fallback_data:
					# No data available - wait a bit longer but still send updates
					wait_time = 2.0
				await asyncio.sleep(wait_time)
				
			except WebSocketDisconnect:
				logger.info(f"WebSocket disconnected for division: {division_lower}")
				break
			except Exception as e:
				logger.error(f"Error in WebSocket loop for {division_lower}: {e}", exc_info=True)
				# Send error message but keep connection alive
				try:
					await websocket.send_json({
						"type": "error",
						"message": f"Error fetching live data: {str(e)}",
						"trains": []
					})
				except Exception:
					# Connection might be dead, break loop
					break
				# Wait before retrying
				await asyncio.sleep(5)
				
	except WebSocketDisconnect:
		logger.info(f"WebSocket disconnected for division: {division_lower}")
	except Exception as e:
		logger.error(f"WebSocket error for {division_lower}: {e}", exc_info=True)
	finally:
		# Clean up connection
		try:
			await websocket.close()
		except Exception:
			pass


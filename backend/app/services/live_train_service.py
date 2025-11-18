from app.services.rapidapi_client import get_rapidapi_client


class LiveTrainService:
	def __init__(self):
		self.client = get_rapidapi_client()

	async def get_live_train(self, train_no: str):
		return await self.client.get_live_train_status(train_no)

	async def get_schedule(self, train_no: str):
		return await self.client.get_train_schedule(train_no)

	async def trains_between(self, src: str, dest: str):
		return await self.client.get_trains_between_stations(src, dest)

	async def get_live_station(self, from_station: str, hours: int = 8):
		"""Get live trains at a station. Returns empty dict if quota exceeded."""
		return await self.client.get_live_station(from_station, hours)


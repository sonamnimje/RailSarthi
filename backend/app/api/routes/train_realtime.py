from fastapi import APIRouter, Depends
from app.services.live_train_service import LiveTrainService

router = APIRouter(tags=["Live Trains"])

@router.get("/train/{train_no}")
async def live_train(train_no: str):
	return await LiveTrainService().get_live_train(train_no)

@router.get("/schedule/{train_no}")
async def schedule(train_no: str):
	return await LiveTrainService().get_schedule(train_no)

@router.get("/between/{src}/{dest}")
async def between(src: str, dest: str):
	return await LiveTrainService().trains_between(src, dest)

@router.get("/station/{from_code}/{to_code}")
async def station(from_code: str, to_code: str, hours: int = 8):
	return await LiveTrainService().get_live_station(from_code, to_code, hours)


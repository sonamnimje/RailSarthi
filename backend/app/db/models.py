from sqlalchemy.orm import DeclarativeBase, relationship, Mapped, mapped_column
from sqlalchemy import String, Integer, Float, DateTime, JSON, ForeignKey, text, Boolean
from datetime import datetime


class Base(DeclarativeBase):
	pass


class User(Base):
	__tablename__ = "users"

	id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
	username: Mapped[str] = mapped_column(String, unique=True, index=True)
	hashed_password: Mapped[str] = mapped_column(String)
	role: Mapped[str] = mapped_column(String, index=True, default="controller")
	is_active: Mapped[bool] = mapped_column(Boolean, default=True)
	created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))


class Train(Base):
	__tablename__ = "trains"

	id: Mapped[str] = mapped_column(String, primary_key=True)
	class_type: Mapped[str] = mapped_column(String, nullable=True)


class Station(Base):
	__tablename__ = "stations"

	id: Mapped[str] = mapped_column(String, primary_key=True)
	name: Mapped[str] = mapped_column(String, nullable=False)
	section_id: Mapped[str] = mapped_column(String, nullable=True)


class TrainSchedule(Base):
	__tablename__ = "train_schedules"

	id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
	train_id: Mapped[str] = mapped_column(String, ForeignKey("trains.id"), index=True)
	station_id: Mapped[str] = mapped_column(String, ForeignKey("stations.id"), index=True)
	planned_arrival: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
	planned_departure: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
	actual_arrival: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
	actual_departure: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
	planned_platform: Mapped[str | None] = mapped_column(String, nullable=True)
	actual_platform: Mapped[str | None] = mapped_column(String, nullable=True)
	status: Mapped[str | None] = mapped_column(String, nullable=True, default="scheduled")  # scheduled, arrived, departed, delayed, cancelled
	delay_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)


class TrainPosition(Base):
	__tablename__ = "train_positions"

	id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
	train_id: Mapped[str] = mapped_column(String, ForeignKey("trains.id"), index=True)
	section_id: Mapped[str] = mapped_column(String, index=True)
	planned_block_id: Mapped[str | None] = mapped_column(String, nullable=True)
	actual_block_id: Mapped[str | None] = mapped_column(String, nullable=True)
	location_km: Mapped[float] = mapped_column(Float)
	speed_kmph: Mapped[float] = mapped_column(Float)
	timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))


class Override(Base):
	__tablename__ = "overrides"

	id: Mapped[str] = mapped_column(String, primary_key=True)
	controller_id: Mapped[str] = mapped_column(String, index=True)
	train_id: Mapped[str] = mapped_column(String, index=True)
	action: Mapped[str] = mapped_column(String)
	ai_action: Mapped[str | None] = mapped_column(String, nullable=True)
	reason: Mapped[str | None] = mapped_column(String, nullable=True)
	timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))


class OptimizerDecision(Base):
	__tablename__ = "optimizer_decisions"

	id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
	section_id: Mapped[str] = mapped_column(String, index=True)
	request: Mapped[dict] = mapped_column(JSON)
	response: Mapped[dict] = mapped_column(JSON)
	latency_ms: Mapped[int] = mapped_column(Integer)
	created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))


class TrainLog(Base):
	__tablename__ = "train_logs"

	id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
	train_id: Mapped[str] = mapped_column(String, ForeignKey("trains.id"), index=True)
	station_id: Mapped[str] = mapped_column(String, ForeignKey("stations.id"), index=True)
	section_id: Mapped[str] = mapped_column(String, index=True)
	event_type: Mapped[str] = mapped_column(String, index=True)  # arrival, departure, delay, status_change
	planned_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
	actual_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
	delay_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
	status: Mapped[str | None] = mapped_column(String, nullable=True)
	platform: Mapped[str | None] = mapped_column(String, nullable=True)
	notes: Mapped[str | None] = mapped_column(String, nullable=True)
	timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))


class SystemSettings(Base):
	__tablename__ = "system_settings"

	id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
	category: Mapped[str] = mapped_column(String, index=True)  # division, simulation, api, disruption, access, logging, reliability, ui
	key: Mapped[str] = mapped_column(String, index=True)
	value: Mapped[dict] = mapped_column(JSON)  # Store flexible JSON values
	updated_by: Mapped[str | None] = mapped_column(String, nullable=True)
	updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"), onupdate=text("CURRENT_TIMESTAMP"))


class AIOverride(Base):
	__tablename__ = "ai_overrides"

	override_id: Mapped[str] = mapped_column(String, primary_key=True)
	timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
	division: Mapped[str] = mapped_column(String, index=True)
	conflict_id: Mapped[str] = mapped_column(String, index=True)
	ai_solution_json: Mapped[dict] = mapped_column(JSON)
	human_solution_json: Mapped[dict] = mapped_column(JSON)
	user_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
	reason: Mapped[str | None] = mapped_column(String, nullable=True)



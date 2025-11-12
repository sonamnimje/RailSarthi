# 👉 Live link: https://rail-anukriti-7u8e.vercel.app/


# 🚆 RailAnukriti – AI-Powered Smart Train Traffic Optimizer
RailAnukriti is an AI-powered decision-support system for Indian Railways section controllers.  
It optimizes train precedence, crossings, and platform allocation to maximize throughput and minimize delays.

The system combines Artificial Intelligence (Reinforcement Learning, Graph Neural Networks) and Operations Research (Constraint Optimization) to make fast, explainable, and adaptive scheduling decisions.

---

## 🎯 Goals
- Enable real-time train scheduling (<1s response)
- Provide explainable recommendations with reasoning
- Simulate disruptions using a digital twin
- Allow human-in-the-loop overrides with adaptive learning
- Improve throughput, reduce congestion, and minimize delays

---

## 🌟 Core Features
- 📍 **Live Dashboard** → Real-time train map, AI suggestions, KPIs
- 🛠 **Simulation Mode** → Test disruption scenarios
- 🧑‍✈️ **Human-in-the-Loop** → Controllers can override AI decisions
- 📊 **Analytics & Reports** → Delay trends, throughput insights
- 🤖 **Adaptive Learning** → Smarter decisions from past delays & overrides

---

## 🏗 Tech Stack

**Backend:**
- Python, FastAPI, Uvicorn
- OR-Tools (Constraint Solver)
- PyTorch + RLlib (Reinforcement Learning)
- Graph Neural Networks (rail network topology learning)

**Frontend:**
- React (Vite)
- TailwindCSS
- Shadcn/UI (compatible)

**Database:**
- SQLite by default (development) – `backend/app/rail.db`
- Optional: PostgreSQL/TimescaleDB for time-series at scale

**Infra/Runtime:**
- WebSockets (real-time updates)
- Local dev via Vite + Uvicorn

---

## 📂 Repository Structure
```text
RailAnukriti/
│── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app factory + routes mount
│   │   ├── api/
│   │   │   └── routes/
│   │   │       ├── ingest.py
│   │   │       ├── optimizer.py
│   │   │       ├── simulator.py
│   │   │       ├── overrides.py
│   │   │       ├── users.py
│   │   │       ├── reports.py
│   │   │       └── ws.py
│   │   ├── core/
│   │   │   └── config.py
│   │   ├── db/
│   │   │   ├── models.py
│   │   │   ├── session.py
│   │   │   └── init_timescaledb.sql
│   │   ├── services/
│   │   │   ├── optimizer.py
│   │   │   └── simulator.py
│   │   └── rail.db                 # SQLite dev database
│   ├── requirements.txt
│   └── uvicorn_app.py              # Uvicorn entrypoint
│
│── frontend/
│   ├── index.html
│   ├── package.json
│   ├── src/
│   │   ├── main.tsx
│   │   ├── index.css
│   │   ├── lib/api.ts
│   │   └── pages/
│   │       ├── App.tsx
│   │       ├── Dashboard.tsx
│   │       ├── Home.tsx
│   │       ├── Login.tsx
│   │       ├── Reports.tsx
│   │       ├── Simulation.tsx
│   │       └── Settings.tsx
│   └── vite.config.ts
│
│── README.md
```

---

## 🚀 Getting Started

### 1️⃣ Clone the repo
```bash
git clone https://github.com/sonamnimje/RailAnukriti.git
cd RailAnukriti
```

### 2️⃣ Backend Setup
```bash
cd backend
pip install -r requirements.txt
# Option A: run via module path
uvicorn app.main:app --reload
# Option B: use helper (same effect)
python uvicorn_app.py
```

### 3️⃣ Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 4️⃣ Database Setup
Development defaults to SQLite at `backend/app/rail.db`. No action needed.

For PostgreSQL/TimescaleDB (optional), use `backend/app/db/init_timescaledb.sql` as a starting point.

### 5️⃣ Run order (local)
1. Start backend (see step 2)
2. Start frontend
```bash
cd frontend
npm run dev
```


## 🔒 Security & Privacy

RailAnukriti implements enterprise-grade security measures to protect sensitive Indian Railways operational data:

### Data Encryption

- **Transport Layer Security (TLS/HTTPS):** All API endpoints use HTTPS encryption
- **WebSocket Security (WSS):** Real-time updates transmitted over secure WebSocket connections
- **Database Encryption:** Database connections use SSL/TLS encryption
- **Password Hashing:** User passwords are hashed using bcrypt before storage

### Role-Based Access Control (RBAC)

The system implements fine-grained access control for different user roles:

- **Controller Role:** 
  - Access to dashboard, recommendations, and override capabilities
  - View train logs and schedules for assigned sections
  - Apply overrides with mandatory reason logging

- **Admin Role:**
  - Full system access including user management
  - Access to analytics, reports, and system configuration
  - Audit log review and system monitoring

- **Authentication:** JWT tokens with configurable expiration (default: 60 minutes)
- **Authorization:** Route-level protection using `require_role()` dependency injection


Every critical action is logged for compliance and accountability:

1. **AI Recommendations:**
   - All AI recommendations are logged in `optimizer_decisions` table
   - Stores request parameters, response, and latency metrics
   - Timestamped for traceability

2. **Human Overrides:**
   - Every override action is recorded in `overrides` table
   - Captures: controller_id, train_id, AI action, human action, reason, timestamp
   - Enables analysis of override patterns and AI accuracy

3. **User Actions:**
   - Login/logout events logged with timestamps
   - Failed authentication attempts tracked
   - User activity monitoring for security audits

4. **Data Access:**
   - Database queries logged for sensitive operations
   - API access patterns monitored
   - Anomaly detection for unauthorized access attempts

### Privacy & Data Protection

- **Data Minimization:** Only necessary operational data is stored
- **Data Retention:** Configurable retention policies for historical data
- **Access Logging:** All data access is logged for audit purposes
- **Secure Credentials:** Database credentials and API keys stored in environment variables, never in code

---

## 🤖 AI Explainability

RailAnukriti provides transparent, explainable AI recommendations to build controller trust and enable informed decision-making.

### How AI Decisions Work

The optimizer uses a multi-factor scoring system that considers:

1. **Historical Delay Patterns:** Trains with consistent delays receive higher priority
2. **Platform Conflicts:** Detects and resolves platform allocation conflicts
3. **Section Congestion:** Adjusts recommendations based on real-time congestion levels
4. **Train Priority:** Express trains prioritized over freight during peak hours


## 🤝 Team RailAnukriti

- 🚆 Backend AI/Optimization: Sonam Nimje, Shreya Saraf
- 🖥 Frontend/UI: Sameeksha Vishwakarma
- 🗄 Database & Infra: Riya Saraf
- 📊 Simulation & Reports: Palak Singh, Richa Singh

---

## 📜 License

MIT License – feel free to use and adapt for research & development.

---


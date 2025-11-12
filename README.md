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

---

## 📊 Example Use Cases

- ✅ Prioritize express trains over goods during peak hours
- ✅ Simulate track maintenance disruptions in digital twin
- ✅ Allocate platforms optimally at busy junctions
- ✅ Adapt schedules when human controllers override

---

## 📡 Data Integration Plan

RailAnukriti integrates with Indian Railways systems through secure APIs to ingest real-time operational data:

### Data Sources

1. **Train Timetable Data**
   - Planned schedules (arrival/departure times, platforms)
   - Route information and station sequences
   - Train classifications (Express, Freight, Local, etc.)
   - **Integration:** REST API endpoints (`/api/ingest/schedules`) with batch ingestion support

2. **Real-Time Train Position Data**
   - GPS-based location tracking (location_km, speed_kmph)
   - Block section occupancy (planned_block_id, actual_block_id)
   - Section-wise train movements
   - **Integration:** Real-time WebSocket streams and batch API (`/api/ingest/positions`)

3. **Signal & Control Room Data**
   - Signal status and block section availability
   - Platform allocation status
   - Control room logs and event timestamps
   - **Integration:** Event-driven API ingestion with event types (arrival, departure, delay, status_change)

4. **Historical Performance Data**
   - Past delay patterns and congestion metrics
   - Historical override decisions and outcomes
   - Section throughput statistics
   - **Integration:** Time-series database (TimescaleDB) for efficient querying

### Secure Connection Architecture

- **API Authentication:** JWT-based authentication with role-based access control (RBAC)
- **Data Encryption:** All API communications use TLS/HTTPS (WSS for WebSockets)
- **API Gateway:** FastAPI backend serves as a secure gateway with CORS protection
- **Database Security:** Encrypted connections to PostgreSQL/TimescaleDB with credential management via environment variables
- **Data Validation:** Pydantic models validate all ingested data before persistence

### Connection Flow

```
Indian Railways Systems → Secure APIs (HTTPS/TLS) → RailAnukriti Backend → Database
                                                         ↓
                                                  Real-time Dashboard (WebSocket)
```

---

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

### Audit Logs

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

### Explainability Example

**Scenario:** Two trains (Train A: Express 12002, Train B: Freight 2299) are approaching the same section simultaneously.

**AI Recommendation:**
```
Action: Give precedence to Train 12002 over Train 2299
Reason: "Train 12002: historical delay 15.0m (score +0.50); 
         platform conflict at P3 (score +0.30); 
         section congestion 4 trains (score +0.20)"
Priority Score: 1.00
Impact: Saves ~45 mins cumulative delay, throughput +3%, fuel -2%
```

**Explanation:** 
The AI prioritized Train A (Express 12002) over Train B (Freight 2299) because:
- Train A is an express train with higher passenger priority
- Train A has historical delay patterns that need mitigation
- Train B (freight) has buffer time available and can afford a short delay
- Giving precedence to Train A reduces cumulative network delay and improves overall throughput
- The decision prevents a platform conflict at the upcoming station (Platform 3)

**Human Override Scenario:**
If a controller overrides this decision, the system:
1. Logs the override with reason (e.g., "Emergency freight priority")
2. Learns from the override to improve future recommendations
3. Maintains audit trail for compliance

### Explainability Features

- **Reasoning Display:** Each recommendation includes a human-readable reason
- **Priority Scores:** Transparent scoring (0.0-1.0) shows recommendation confidence
- **Impact Metrics:** Shows expected time savings, throughput improvements, fuel savings
- **Historical Context:** Explains how past data influenced the decision
- **Override Learning:** System adapts based on controller overrides

---

## 📈 Scalability Plan

RailAnukriti is designed to scale from single-section deployments to full Indian Railways network integration.

### Current Architecture (Single Section)

- **Scope:** One railway section (e.g., SEC-001)
- **Data Volume:** Handles ~100-1000 trains per day
- **Response Time:** <1 second for optimization recommendations
- **Database:** SQLite (dev) or PostgreSQL (production)

### Multi-Section Deployment

**Phase 1: Horizontal Scaling**
- Deploy multiple RailAnukriti instances, one per section
- Each instance operates independently with its own database
- Centralized API gateway for unified access
- Shared authentication and authorization service

**Phase 2: Distributed Architecture**
- Microservices architecture with section-specific services
- Message queue (Redis/RabbitMQ) for inter-section coordination
- Centralized TimescaleDB for time-series data aggregation
- Load balancer for high availability

### Full TMS (Train Management System) Integration

**Integration Points:**

1. **Real-Time Data Integration:**
   - Direct integration with Indian Railways TMS APIs
   - Event-driven architecture for real-time updates
   - Data synchronization across multiple sections

2. **Network-Wide Optimization:**
   - Graph Neural Networks (GNN) for network topology learning
   - Multi-section optimization considering cross-section dependencies
   - Cascading delay prevention across the network

3. **Scalability Metrics:**
   - **Target:** Handle 10,000+ trains per day across multiple sections
   - **Response Time:** Maintain <1s response time with distributed caching
   - **Database:** TimescaleDB for time-series data at scale
   - **Compute:** Kubernetes cluster for auto-scaling based on load

4. **Performance Optimization:**
   - Redis caching for frequently accessed data
   - Database query optimization and indexing
   - Async processing for non-critical operations
   - CDN for frontend static assets

### Scalability Features

- **Stateless Backend:** FastAPI services are stateless, enabling horizontal scaling
- **Database Sharding:** Section-based sharding for large deployments
- **Caching Layer:** Redis cache for recommendations and KPIs
- **WebSocket Scaling:** WebSocket connections managed via connection pooling
- **Monitoring:** Prometheus/Grafana for performance monitoring and alerting

---

## 📊 KPIs Dashboard

The RailAnukriti dashboard provides real-time and historical metrics to monitor system performance and operational efficiency.

### Key Performance Indicators (KPIs)

1. **Throughput Metrics**
   - **Trains per Hour:** Real-time throughput (target: 50+ trains/hour)
   - **Section Utilization:** Percentage of section capacity used
   - **Platform Turnaround:** Average platform occupancy time

2. **Delay Metrics**
   - **Average Delay Minutes:** Mean delay across all trains (target: <5 minutes)
   - **On-Time Percentage:** Percentage of trains arriving on time (target: >90%)
   - **Delay Reduction:** Improvement compared to baseline (target: 20-30% reduction)

3. **AI Performance Metrics**
   - **AI Accuracy:** Percentage of AI recommendations accepted vs. overridden
   - **Recommendation Latency:** Average time to generate recommendations (target: <1s)
   - **Override Rate:** Percentage of recommendations overridden by controllers

4. **Operational Metrics**
   - **Congestion Index:** Real-time congestion level (0.0-1.0 scale)
   - **Platform Conflicts Resolved:** Number of conflicts prevented by AI
   - **Controller Satisfaction:** Feedback score from controllers (future)

### Sample Dashboard Metrics

```
┌─────────────────────────────────────────────────────────┐
│  📊 RailAnukriti Dashboard - Section SEC-001            │
├─────────────────────────────────────────────────────────┤
│  Throughput: 52 trains/hour  │  Avg Delay: 3.5 min     │
│  On-Time: 92.1%             │  Congestion: 0.42       │
├─────────────────────────────────────────────────────────┤
│  AI Accuracy: 85%           │  Override Rate: 15%     │
│  Recommendation Latency: 5ms │  Conflicts Resolved: 12 │
└─────────────────────────────────────────────────────────┘
```

### Historical Trends

- **Delay Trends:** Hourly delay patterns over the last 24 hours
- **Throughput Analysis:** Train volume by class (Express, Freight, Local)
- **Hotspot Analysis:** Section-wise congestion heatmaps
- **AI Performance Over Time:** Tracking accuracy and override rates

### Reports & Analytics

- **Daily Reports:** Summary of daily operations and AI performance
- **Weekly Trends:** Weekly analysis of delays, throughput, and AI accuracy
- **Custom Reports:** Configurable time ranges and filters for detailed analysis
- **Export Capabilities:** CSV/PDF export for offline analysis

---

## 🤝 Team RailAnukriti

- 🚆 Backend AI/Optimization: Sonam Nimje, Shreya Saraf
- 🖥 Frontend/UI: Sameeksha Vishwakarma
- 🗄 Database & Infra: Riya Saraf
- 📊 Simulation & Reports: Palak Singh, Richa Singh

---

## 📜 License

MIT License – feel free to use and adapt for research & development.

---


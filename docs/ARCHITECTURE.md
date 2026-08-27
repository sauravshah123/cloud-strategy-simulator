# Cloud Strategy Simulator — Architecture

## Overview

A cloud-agnostic auto-scaling strategy evaluation platform that simulates, compares, and
optimises Kubernetes scaling policies using real CPU/memory telemetry, AI-powered analysis,
full observability, and multi-cloud cost modelling.

---

## System Architecture Diagram

```
                           USERS
                             │
                             ▼
                   ┌───────────────────┐
                   │  React Dashboard  │  (Vite + React 19 + Tailwind)
                   │  Port 3000        │
                   └─────────┬─────────┘
                             │ REST + SSE
                             ▼
                   ┌───────────────────┐
                   │   API Gateway     │
                   │   Spring Boot 3.2 │  Port 8080
                   │   /api/*          │
                   └─────────┬─────────┘
                             │
         ┌───────────────────┼────────────────────┐
         │                   │                    │
         ▼                   ▼                    ▼
   ┌───────────┐     ┌───────────────┐     ┌──────────┐
   │ Auth/RBAC │     │ Policy Engine │     │  Audit   │
   │  JWT      │     │               │     │  Log     │
   └───────────┘     └──────┬────────┘     └──────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ Decision Engine │
                   └────────┬────────┘
                            │
              ┌─────────────┼──────────────┐
              │             │              │
              ▼             ▼              ▼
        ┌──────────┐ ┌────────────┐ ┌────────────┐
        │ Scaling  │ │ Self-Heal  │ │   Cost     │
        │ Engine   │ │ Engine     │ │ Optimizer  │
        └────┬─────┘ └─────┬──────┘ └────────────┘
             │             │
             └──────┬──────┘
                    ▼
            ┌───────────────┐
            │  K8s Operator │
            └───────┬───────┘
                    │
           ┌────────┼─────────┐
           ▼        ▼         ▼
         AWS EKS   GKE       AKS
           │        │         │
           └────────┼─────────┘
                    │
              Kubernetes
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    Services      Pods        Nodes
```

## Observability Stack

```
Application Metrics (OSHI / OpenTelemetry SDK)
          │
          ▼
   OTel Collector  (port 4317 gRPC / 4318 HTTP)
          │
   ┌──────┼──────────┐
   ▼      ▼          ▼
Prometheus  Loki    Tempo
(metrics) (logs)  (traces)
   │        │       │
   └────────┼───────┘
            ▼
         Grafana  (port 3001)
            │
            ▼
     Decision Engine
```

---

## Phase Roadmap

| Phase | Name                         | Status |
|-------|------------------------------|--------|
|   0   | Requirements & Architecture  | ✅     |
|   1   | Local Kubernetes Environment | ✅     |
|   2   | Backend Foundation           | ✅     |
|   3   | Cluster Management           | ✅     |
|   4   | Workload Management          | ✅     |
|   5   | Observability                | ✅     |
|   6   | Basic Auto-Scaling           | ✅     |
|   7   | Intelligent Multi-Metric     | ✅     |
|   8   | Self-Healing Engine          | ✅     |
|   9   | Anomaly Detection            | ✅     |
|  10   | Predictive Scaling           | ✅     |
|  11   | SLO-Based Scaling            | ✅     |
|  12   | Cost-Aware Scaling           | ✅     |
|  13   | Multi-Cluster / Multi-Cloud  | ✅     |
|  14   | Kubernetes Operator / CRDs   | ✅     |
|  15   | Security & RBAC              | ✅     |
|  16   | GitOps                       | ✅     |
|  17   | Chaos Engineering            | ✅     |
|  18   | AI Assistant                 | ✅     |
|  19   | Testing & Benchmarking       | ✅     |
|  20   | Production Deployment        | ✅     |

---

## Technology Stack

### Backend
- Java 17 + Spring Boot 3.2.4
- Spring Data JPA (H2 dev / PostgreSQL prod)
- Spring Security + JWT
- OSHI (real CPU/memory metrics)
- Docker Java SDK (container orchestration)
- OpenTelemetry Java Agent
- SpringDoc OpenAPI 2.3

### Frontend
- React 19 + Vite 8
- Tailwind CSS 4
- Custom SVG charts (no external charting library)
- SSE for real-time streaming

### Infrastructure
- Kubernetes (kind locally, EKS/GKE/AKS production)
- Helm 3 (chart management)
- ArgoCD (GitOps)
- KEDA (event-driven autoscaling)

### Observability
- OpenTelemetry Collector
- Prometheus + Grafana
- Loki (logs)
- Tempo (traces)

---

## API Endpoints

| Method | Path                         | Description                    |
|--------|------------------------------|--------------------------------|
| POST   | /api/experiment              | Run scaling experiment          |
| GET    | /api/history                 | Experiment history              |
| GET    | /api/metrics/stream          | Live metrics SSE stream         |
| GET    | /api/metrics                 | Current metrics snapshot        |
| GET    | /api/healing/stream          | Healing events SSE stream       |
| GET    | /api/healing/status          | Healing engine status           |
| POST   | /api/healing/arm             | Arm healing engine              |
| POST   | /api/healing/chaos           | Trigger chaos scenario          |
| GET    | /api/alerts/stream           | Alerts SSE stream               |
| GET    | /api/alerts                  | Alert list                      |
| POST   | /api/alerts/{id}/acknowledge | Acknowledge alert               |
| GET    | /api/config                  | Strategy configurations         |
| PUT    | /api/config/{strategy}       | Update strategy config          |
| GET    | /api/sla                     | SLA summaries                   |
| GET    | /api/audit                   | Audit log                       |
| GET    | /api/anomaly                 | Anomaly detections              |
| GET    | /api/predict/scaling         | Scaling predictions             |
| GET    | /api/clusters                | Registered clusters             |
| GET    | /api/costs/compare           | Multi-cloud cost comparison     |
| POST   | /api/ai/chat                 | AI assistant chat               |
| GET    | /api/system/info             | System information              |
| GET    | /swagger-ui.html             | Interactive API documentation   |

---

## Directory Structure

```
cloud-strategy-simulator/
├── backend/                        # Spring Boot application
│   ├── src/main/java/com/major/cloud/
│   │   ├── config/                 # CORS, Security, OpenAPI config
│   │   ├── controller/             # REST + SSE controllers
│   │   ├── model/                  # JPA entities + POJOs
│   │   ├── repository/             # Spring Data repositories
│   │   ├── service/                # Business logic
│   │   ├── strategy/               # Scaling strategy implementations
│   │   └── scheduler/              # Background scheduled tasks
│   └── src/main/resources/
│       ├── application.properties  # Dev configuration
│       └── application-prod.properties  # Production configuration
├── frontend/                       # React SPA
│   ├── public/                     # Static assets
│   └── src/
│       ├── components/             # Reusable UI components
│       └── pages/                  # Page-level components
├── k8s/                            # Kubernetes manifests
│   ├── base/                       # Namespace, RBAC
│   ├── workloads/                  # Deployments, Services, HPAs
│   ├── monitoring/                 # Prometheus, Grafana configs
│   ├── crds/                       # Custom Resource Definitions
│   └── operator/                   # K8s Operator manifests
├── helm/                           # Helm chart
│   └── cloud-simulator/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
├── observability/                  # OTel + Grafana config
│   ├── otel-collector-config.yaml
│   ├── prometheus.yml
│   └── grafana/
│       ├── dashboards/
│       └── provisioning/
├── .github/workflows/              # CI/CD pipelines
├── docs/                           # Documentation
└── docker-compose.yml              # Local dev stack
```

---

## Data Flow

```
OSHI (real OS metrics)
       │
       ▼
MonitoringService.generateTrafficWave(steps)
       │  [List<Workload> — cpu, mem, traffic, trend per step]
       ▼
ExperimentService.runExperimentDetailed(strategies, dockerImage)
       │
       ├──► For each strategy:
       │      ScalingService.applyStrategy(strategy, replicas, cpu, trend, latency)
       │        └──► strategy.calculateReplicas(currentReplicas, metricValue)
       │               └──► StrategyConfigService thresholds (WIRED Phase 2)
       │
       ├──► DockerOrchestrationService (if Docker available)
       │      start/stop containers per scaling decision
       │
       ├──► AutoHealingEngine (background, 3s loop)
       │      detect crashed containers → restart → broadcast HealingEvent SSE
       │
       ├──► CostCalculationService.compareStrategyCosts(results, duration)
       ├──► SlaTrackerService.recordTick(strategy, replicas)
       ├──► AnomalyDetectionService.analyze(cpuTimeline)
       ├──► PredictiveScalingService.forecast(history)
       └──► WebhookService.fireExperiment(summary)
```

---

## Security Model (Phase 15)

```
Roles:
  ADMIN    — full access (experiment, config, chaos, audit, users)
  OPERATOR — run experiments, view everything, modify configs
  VIEWER   — read-only access to metrics and results

JWT claims: { sub, roles, exp }
Token validity: 24h (access), 7d (refresh)
```

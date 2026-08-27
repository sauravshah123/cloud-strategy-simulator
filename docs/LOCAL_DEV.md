# Local Development Guide

## Quick Start (Docker Compose)

The fastest way to run the full stack locally — no Kubernetes required.

```bash
# Clone and start everything
git clone <repo>
cd cloud-strategy-simulator
docker-compose up -d

# Watch logs
docker-compose logs -f backend

# Stop
docker-compose down
```

| Service    | URL                          | Credentials    |
|------------|------------------------------|----------------|
| Frontend   | http://localhost:3000        | —              |
| Backend    | http://localhost:8080        | —              |
| Swagger UI | http://localhost:8080/swagger-ui.html | —   |
| Grafana    | http://localhost:3001        | admin / admin  |
| Prometheus | http://localhost:9090        | —              |
| PostgreSQL | localhost:5432               | cloudscale / cloudscale_secret |

---

## Local Kubernetes (kind)

### Prerequisites

Install the following tools:

| Tool      | Version | Install |
|-----------|---------|---------|
| Docker    | 24+     | https://docs.docker.com/get-docker/ |
| kind      | 0.22+   | `brew install kind` or https://kind.sigs.k8s.io/ |
| kubectl   | 1.29+   | `brew install kubectl` |
| helm      | 3.14+   | `brew install helm` |

### Bootstrap

```bash
# Make bootstrap script executable
chmod +x infra/bootstrap.sh

# Run (creates cluster, installs NGINX, KEDA, deploys app)
./infra/bootstrap.sh
```

This script:
1. Creates a local Docker registry on `localhost:5001`
2. Creates a 3-node kind cluster (`1 control-plane + 2 workers`)
3. Installs metrics-server, NGINX Ingress, cert-manager, KEDA
4. Deploys all application Kubernetes manifests

### Manual cluster setup

```bash
# Create cluster
kind create cluster --config=infra/kind-cluster.yaml --name=cloud-simulator

# Set context
kubectl config use-context kind-cloud-simulator

# Apply base manifests
kubectl apply -f k8s/base/
kubectl apply -f k8s/workloads/
kubectl apply -f k8s/monitoring/

# Access the app
kubectl port-forward -n cloud-simulator svc/simulator-backend 8080:8080
```

### Cluster teardown

```bash
kind delete cluster --name=cloud-simulator
```

---

## Backend Development (without Docker)

### Prerequisites
- Java 17+
- Maven 3.9+

```bash
cd backend

# Run with H2 in-memory database (default profile)
./mvnw spring-boot:run

# Run with PostgreSQL (prod profile — needs Docker postgres running)
docker-compose up -d postgres
./mvnw spring-boot:run -Dspring-boot.run.profiles=prod
```

### Build JAR

```bash
cd backend
./mvnw clean package -DskipTests
java -jar target/cloud-strategy-simulator-0.0.1-SNAPSHOT.jar
```

---

## Frontend Development

### Prerequisites
- Node.js 20+

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at http://localhost:5173 in dev mode and proxies nothing —
it calls the backend directly via `VITE_API_URL` (defaults to `http://localhost:8080`).

### Build for production

```bash
cd frontend
npm run build
# Output in frontend/dist/
```

---

## Environment Variables

### Backend

| Variable                     | Default               | Description                    |
|------------------------------|-----------------------|--------------------------------|
| `SPRING_PROFILES_ACTIVE`     | `default` (H2)        | `prod` for PostgreSQL          |
| `SPRING_DATASOURCE_URL`      | H2 in-memory          | JDBC URL                       |
| `SPRING_DATASOURCE_USERNAME` | `sa`                  | DB username                    |
| `SPRING_DATASOURCE_PASSWORD` | `password`            | DB password                    |
| `JWT_SECRET`                 | `change-me-...`       | 32+ char JWT signing secret    |
| `OTEL_EXPORTER_OTLP_ENDPOINT`| —                     | OTel collector endpoint        |

### Frontend

| Variable       | Default                  | Description         |
|----------------|--------------------------|---------------------|
| `VITE_API_URL` | `localhost:8080`         | Backend host:port   |

---

## Troubleshooting

### Backend fails to start
- Check `docker-compose logs backend`
- Ensure PostgreSQL is healthy: `docker-compose ps postgres`
- Try the H2 dev profile: `SPRING_PROFILES_ACTIVE=default`

### Frontend can't connect to backend
- Verify `VITE_API_URL` is set correctly
- Check CORS config in `CorsConfig.java` allows your origin
- Ensure backend is running: `curl http://localhost:8080/actuator/health`

### kind cluster stuck
- Increase Docker memory to 8 GB in Docker Desktop settings
- Check: `kubectl get nodes` — should show 3 nodes Ready
- Restart: `kind delete cluster --name=cloud-simulator && ./infra/bootstrap.sh`

### Metrics not appearing in Grafana
- Check OTel collector: `docker-compose logs otel`
- Verify Prometheus scrapes: http://localhost:9090/targets
- Check Grafana data sources: http://localhost:3001/datasources

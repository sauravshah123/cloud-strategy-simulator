#!/usr/bin/env bash
# =============================================================================
# Cloud Strategy Simulator — Local Kubernetes Bootstrap
# =============================================================================
# Prerequisites: Docker, kind, kubectl, helm
# Usage: chmod +x infra/bootstrap.sh && ./infra/bootstrap.sh
# =============================================================================
set -euo pipefail

CLUSTER_NAME="cloud-simulator"
REGISTRY_NAME="kind-registry"
REGISTRY_PORT="5001"
NAMESPACE="cloud-simulator"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Prerequisites check ────────────────────────────────────────────────────
check_prereqs() {
  info "Checking prerequisites..."
  for cmd in docker kind kubectl helm; do
    command -v "$cmd" &>/dev/null || error "$cmd is not installed. Please install it first."
  done
  info "All prerequisites satisfied."
}

# ── Local Docker registry ──────────────────────────────────────────────────
setup_registry() {
  if docker ps --format '{{.Names}}' | grep -q "^${REGISTRY_NAME}$"; then
    info "Local registry already running."
  else
    info "Starting local Docker registry on port ${REGISTRY_PORT}..."
    docker run -d --restart=always -p "127.0.0.1:${REGISTRY_PORT}:5000" \
      --name "${REGISTRY_NAME}" registry:2
  fi
}

# ── kind cluster ───────────────────────────────────────────────────────────
create_cluster() {
  if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
    warn "Cluster '${CLUSTER_NAME}' already exists. Skipping creation."
  else
    info "Creating kind cluster '${CLUSTER_NAME}'..."
    kind create cluster --config=infra/kind-cluster.yaml --name="${CLUSTER_NAME}"
  fi

  # Connect registry to cluster network
  if ! docker network inspect kind | grep -q "${REGISTRY_NAME}"; then
    docker network connect kind "${REGISTRY_NAME}" 2>/dev/null || true
  fi

  # Configure containerd to use local registry
  for node in $(kind get nodes --name="${CLUSTER_NAME}"); do
    docker exec "${node}" sh -c \
      "echo '[host.\"http://kind-registry:5000\"]' > /etc/containerd/certs.d/localhost:${REGISTRY_PORT}/hosts.toml"
  done

  kubectl cluster-info --context "kind-${CLUSTER_NAME}"
}

# ── Namespace & base RBAC ─────────────────────────────────────────────────
setup_namespace() {
  info "Setting up namespace and RBAC..."
  kubectl apply -f k8s/base/namespace.yaml
  kubectl apply -f k8s/base/rbac.yaml
}

# ── Metrics Server ─────────────────────────────────────────────────────────
install_metrics_server() {
  info "Installing metrics-server..."
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
  kubectl patch deployment metrics-server -n kube-system \
    --type=json -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]' \
    2>/dev/null || true
}

# ── NGINX Ingress Controller ───────────────────────────────────────────────
install_ingress() {
  info "Installing NGINX Ingress Controller..."
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
  kubectl wait --namespace ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=120s || warn "Ingress controller not ready yet — continuing."
}

# ── Cert-Manager ──────────────────────────────────────────────────────────
install_cert_manager() {
  info "Installing cert-manager..."
  helm repo add jetstack https://charts.jetstack.io --force-update
  helm upgrade --install cert-manager jetstack/cert-manager \
    --namespace cert-manager --create-namespace \
    --set installCRDs=true --wait --timeout 120s || warn "cert-manager install had issues."
}

# ── KEDA (Event-Driven Autoscaler) ────────────────────────────────────────
install_keda() {
  info "Installing KEDA..."
  helm repo add kedacore https://kedacore.github.io/charts --force-update
  helm upgrade --install keda kedacore/keda \
    --namespace keda --create-namespace \
    --wait --timeout 120s || warn "KEDA install had issues."
}

# ── Application manifests ─────────────────────────────────────────────────
deploy_app() {
  info "Deploying application manifests..."
  kubectl apply -f k8s/base/
  kubectl apply -f k8s/workloads/
  kubectl apply -f k8s/monitoring/
}

# ── Port-forward helper ────────────────────────────────────────────────────
port_forward_info() {
  echo ""
  echo -e "${GREEN}════════════════════════════════════════════${NC}"
  echo -e "${GREEN} Cloud Strategy Simulator — Bootstrap Done  ${NC}"
  echo -e "${GREEN}════════════════════════════════════════════${NC}"
  echo ""
  echo "Access the services:"
  echo "  kubectl port-forward -n ${NAMESPACE} svc/simulator-backend  8080:8080 &"
  echo "  kubectl port-forward -n ${NAMESPACE} svc/simulator-frontend 3000:3000 &"
  echo "  kubectl port-forward -n ${NAMESPACE} svc/prometheus          9090:9090 &"
  echo "  kubectl port-forward -n ${NAMESPACE} svc/grafana             3001:3001 &"
  echo ""
  echo "Or start the full stack with docker-compose:"
  echo "  docker-compose up -d"
  echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────
main() {
  check_prereqs
  setup_registry
  create_cluster
  setup_namespace
  install_metrics_server
  install_ingress
  install_keda
  deploy_app
  port_forward_info
}

main "$@"

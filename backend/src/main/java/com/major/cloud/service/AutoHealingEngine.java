package com.major.cloud.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.major.cloud.model.HealingEvent;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Industry-grade Auto-Healing Engine.
 *
 * Two modes:
 *  DOCKER  — polls real container health every 3 s using the Docker daemon.
 *            Detects stopped/crashed containers and spins up replacements.
 *  SIMULATED — when Docker is unavailable, uses a probabilistic fault model
 *              to demonstrate healing behaviour without real containers.
 *
 * All healing events are persisted in-memory and broadcast in real-time
 * to every connected SSE client so the frontend chart updates immediately.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AutoHealingEngine {

    private final DockerOrchestrationService docker;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // ── State ─────────────────────────────────────────────────────────────────
    /** The Docker image to use when restarting containers (set when experiment begins). */
    @Getter private volatile String activeImage = null;

    /** Whether a Docker-or-Simulated experiment is in progress. */
    private final AtomicBoolean experimentActive = new AtomicBoolean(false);

    /** Running healing-event count across all strategies. */
    private final AtomicInteger totalHeals = new AtomicInteger(0);

    /** Full history of every healing event (since app start). */
    private final List<HealingEvent> healingHistory = new CopyOnWriteArrayList<>();

    /** SSE subscribers for the /api/healing/stream endpoint. */
    private final CopyOnWriteArrayList<SseEmitter> subscribers = new CopyOnWriteArrayList<>();

    // ── Simulation support ────────────────────────────────────────────────────
    private static final String[] SIM_STRATEGIES = {"CPU", "TREND", "LATENCY"};
    private final Map<String, AtomicInteger> simReplicas   = new ConcurrentHashMap<>();
    private final Map<String, List<String>>  simContainers = new ConcurrentHashMap<>();
    private final Random rng = new Random();

    // ── API ───────────────────────────────────────────────────────────────────

    /** Called by ExperimentService to arm the healer for a new experiment. */
    public void startExperiment(String image) {
        this.activeImage = image;
        this.experimentActive.set(true);
        if (!docker.isDockerAvailable()) {
            initSimulation();
        }
        log.info("🛡  AutoHealingEngine ARMED (mode={})", docker.isDockerAvailable() ? "DOCKER" : "SIMULATED");
    }

    /** Called by ExperimentService when the experiment finishes. */
    public void stopExperiment() {
        this.experimentActive.set(false);
        simContainers.clear();
        simReplicas.clear();
        log.info("🛡  AutoHealingEngine DISARMED");
    }

    public List<HealingEvent> getHistory() {
        return Collections.unmodifiableList(healingHistory);
    }

    public int getTotalHeals() {
        return totalHeals.get();
    }

    public boolean isActive() {
        return experimentActive.get();
    }

    public String getMode() {
        return docker.isDockerAvailable() ? "DOCKER" : "SIMULATED";
    }

    /** Returns a live status snapshot for the /api/healing/status endpoint. */
    public Map<String, Object> getStatus() {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("active",      experimentActive.get());
        s.put("mode",        getMode());
        s.put("totalHeals",  totalHeals.get());
        s.put("image",       activeImage);
        s.put("subscribers", subscribers.size());
        if (docker.isDockerAvailable()) {
            Map<String, Integer> replicas = new LinkedHashMap<>();
            for (String strat : SIM_STRATEGIES) {
                replicas.put(strat, docker.getActiveContainers(strat).size());
            }
            s.put("replicas", replicas);
        } else {
            Map<String, Integer> replicas = new LinkedHashMap<>();
            simReplicas.forEach((k, v) -> replicas.put(k, v.get()));
            s.put("replicas", replicas);
        }
        return s;
    }

    // ── Scheduled heal loop (runs every 3 s) ─────────────────────────────────

    @Scheduled(fixedDelay = 3000)
    public void healLoop() {
        if (!experimentActive.get()) return;

        if (docker.isDockerAvailable()) {
            runDockerHealPass();
        } else {
            runSimulatedHealPass();
        }
    }

    // ── Docker mode ───────────────────────────────────────────────────────────

    private void runDockerHealPass() {
        for (String strategy : SIM_STRATEGIES) {
            List<String> containers = docker.getActiveContainers(strategy);
            for (String id : containers) {
                if (!docker.isRunning(id)) {
                    long start = System.currentTimeMillis();
                    log.warn("⚠️  HEAL DETECT [DOCKER]: container {} ({}) is down", shortId(id), strategy);

                    docker.stopSpecificContainer(strategy, id);
                    String replacementId = activeImage != null
                            ? docker.startContainer(strategy, activeImage) : null;

                    long elapsed = System.currentTimeMillis() - start;
                    HealingEvent evt = new HealingEvent(
                            strategy,
                            shortId(id),
                            replacementId != null ? shortId(replacementId) : "FAILED",
                            docker.getActiveContainers(strategy).size(),
                            "DOCKER",
                            replacementId != null
                                ? "Container " + shortId(id) + " crashed. Replacement " + shortId(replacementId) + " started."
                                : "Container " + shortId(id) + " crashed. Replacement FAILED (image unavailable?).",
                            LocalDateTime.now(),
                            elapsed
                    );
                    persist(evt);
                }
            }
        }
    }

    // ── Simulation mode ───────────────────────────────────────────────────────

    private void initSimulation() {
        for (String s : SIM_STRATEGIES) {
            simReplicas.put(s, new AtomicInteger(2));
            List<String> ids = new ArrayList<>();
            for (int i = 0; i < 2; i++) ids.add(fakeId());
            simContainers.put(s, new CopyOnWriteArrayList<>(ids));
        }
    }

    private void runSimulatedHealPass() {
        // Each container has a ~4 % chance of "crashing" per 3-second cycle
        for (String strategy : SIM_STRATEGIES) {
            List<String> containers = simContainers.getOrDefault(strategy, new ArrayList<>());
            List<String> dead = new ArrayList<>();
            for (String id : containers) {
                if (rng.nextDouble() < 0.04) dead.add(id); // 4 % failure rate
            }
            for (String deadId : dead) {
                long start = System.currentTimeMillis();
                containers.remove(deadId);

                String newId = fakeId();
                containers.add(newId);

                long elapsed = System.currentTimeMillis() - start;
                HealingEvent evt = new HealingEvent(
                        strategy,
                        deadId,
                        newId,
                        containers.size(),
                        "SIMULATED",
                        "[SIM] Container " + deadId + " crashed. Replacement " + newId + " started automatically.",
                        LocalDateTime.now(),
                        elapsed
                );
                persist(evt);
            }
        }
    }

    // ── SSE broadcasting ──────────────────────────────────────────────────────

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        subscribers.add(emitter);
        emitter.onCompletion(() -> subscribers.remove(emitter));
        emitter.onTimeout(()    -> subscribers.remove(emitter));
        emitter.onError(e       -> subscribers.remove(emitter));

        // Send current status immediately on connect
        try {
            emitter.send(SseEmitter.event().name("status").data(
                    objectMapper.writeValueAsString(getStatus())));
        } catch (IOException ignored) {}

        return emitter;
    }

    private void persist(HealingEvent evt) {
        healingHistory.add(evt);
        totalHeals.incrementAndGet();
        log.info("🔧 HEALED: {} [{}] → {} ({}ms)", evt.getCrashedContainerId(),
                evt.getStrategy(), evt.getReplacementContainerId(), evt.getHealDurationMs());
        broadcast(evt);
    }

    private void broadcast(HealingEvent evt) {
        String json;
        try { json = objectMapper.writeValueAsString(evt); }
        catch (Exception e) { return; }

        subscribers.removeIf(emitter -> {
            try {
                emitter.send(SseEmitter.event().name("healing").data(json));
                return false;
            } catch (IOException ex) {
                return true;
            }
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static String shortId(String id) {
        if (id == null) return "<null>";
        return id.length() > 12 ? id.substring(0, 12) : id;
    }

    private String fakeId() {
        return String.format("%08x", rng.nextInt(Integer.MAX_VALUE));
    }
}

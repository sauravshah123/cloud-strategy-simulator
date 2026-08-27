package com.major.cloud.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Real-time alert engine.
 * Evaluates incoming metrics against configurable rules.
 * Fires alerts via SSE to all connected subscribers.
 * Delivers webhook notifications for CRITICAL/WARNING alerts.
 */
@Slf4j
@Service
public class AlertService {

    private WebhookService webhookService;

    // Lazy injection to avoid circular dependency (WebhookService → AlertService → WebhookService)
    public void setWebhookService(@Lazy WebhookService webhookService) {
        this.webhookService = webhookService;
    }

    public enum Severity { INFO, WARNING, CRITICAL }

    public record AlertRule(
            String   id,
            String   name,
            String   metric,        // "cpu" | "memory" | "latency" | "replicas"
            String   operator,      // "gt" | "lt"
            double   threshold,
            Severity severity,
            boolean  enabled
    ) {}

    @Getter
    public static class Alert {
        private final String        id;
        private final AlertRule     rule;
        private final double        actualValue;
        private final String        message;
        private final LocalDateTime timestamp;
        private boolean             acknowledged;

        public Alert(AlertRule rule, double actualValue) {
            this.id           = UUID.randomUUID().toString().substring(0, 8);
            this.rule         = rule;
            this.actualValue  = Math.round(actualValue * 10.0) / 10.0;
            this.message      = rule.name() + ": " + rule.metric() + " is " + actualValue + " (threshold " + rule.operator() + " " + rule.threshold() + ")";
            this.timestamp    = LocalDateTime.now();
            this.acknowledged = false;
        }
        public void acknowledge() { this.acknowledged = true; }
    }

    // ── Default built-in rules ────────────────────────────────────────────────
    private final List<AlertRule> rules = new CopyOnWriteArrayList<>(List.of(
        new AlertRule("r1", "High CPU",        "cpu",     "gt", 80.0, Severity.CRITICAL, true),
        new AlertRule("r2", "Elevated CPU",    "cpu",     "gt", 60.0, Severity.WARNING,  true),
        new AlertRule("r3", "High Memory",     "memory",  "gt", 85.0, Severity.CRITICAL, true),
        new AlertRule("r4", "Elevated Memory", "memory",  "gt", 70.0, Severity.WARNING,  true),
        new AlertRule("r5", "High Latency",    "latency", "gt", 400.0, Severity.WARNING,  true),
        new AlertRule("r6", "Critical Latency","latency", "gt", 800.0, Severity.CRITICAL, true)
    ));

    private final List<Alert> firedAlerts   = new CopyOnWriteArrayList<>();
    private final CopyOnWriteArrayList<SseEmitter> subscribers = new CopyOnWriteArrayList<>();
    private final ObjectMapper mapper = new ObjectMapper();

    // ── Rule management ───────────────────────────────────────────────────────

    public List<AlertRule> getRules() { return Collections.unmodifiableList(rules); }

    public AlertRule addRule(AlertRule rule) {
        // create with guaranteed unique id
        AlertRule r = new AlertRule(
            UUID.randomUUID().toString().substring(0, 8),
            rule.name(), rule.metric(), rule.operator(),
            rule.threshold(), rule.severity(), rule.enabled()
        );
        rules.add(r);
        return r;
    }

    public boolean deleteRule(String id) {
        return rules.removeIf(r -> r.id().equals(id));
    }

    public boolean acknowledgeAlert(String id) {
        for (Alert a : firedAlerts) {
            if (a.getId().equals(id)) { a.acknowledge(); return true; }
        }
        return false;
    }

    public List<Alert> getAlerts(boolean unacknowledgedOnly) {
        if (!unacknowledgedOnly) return Collections.unmodifiableList(firedAlerts);
        return firedAlerts.stream().filter(a -> !a.isAcknowledged()).toList();
    }

    public void clearAlerts() { firedAlerts.clear(); }

    // ── Evaluation ────────────────────────────────────────────────────────────

    /** Called by MetricsStreamController every 2 s with fresh CPU/memory values. */
    public void evaluate(double cpu, double memory) {
        for (AlertRule rule : rules) {
            if (!rule.enabled()) continue;
            double value = switch (rule.metric()) {
                case "cpu"    -> cpu;
                case "memory" -> memory;
                default       -> 0;
            };
            if (isTriggered(rule, value)) fire(rule, value);
        }
    }

    /** Called by ExperimentService per strategy step with latency. */
    public void evaluateLatency(double latencyMs) {
        for (AlertRule rule : rules) {
            if (!rule.enabled() || !rule.metric().equals("latency")) continue;
            if (isTriggered(rule, latencyMs)) fire(rule, latencyMs);
        }
    }

    private boolean isTriggered(AlertRule rule, double value) {
        return switch (rule.operator()) {
            case "gt" -> value > rule.threshold();
            case "lt" -> value < rule.threshold();
            default   -> false;
        };
    }

    private void fire(AlertRule rule, double value) {
        // Rate-limit: don't re-fire same rule within 30 s
        long now = System.currentTimeMillis();
        boolean recentlyFired = firedAlerts.stream().anyMatch(a ->
            a.getRule().id().equals(rule.id()) &&
            java.time.Duration.between(a.getTimestamp(), LocalDateTime.now()).getSeconds() < 30
        );
        if (recentlyFired) return;

        Alert alert = new Alert(rule, value);
        firedAlerts.add(alert);
        log.warn("🚨 ALERT [{}] {} — value={}", rule.severity(), alert.getMessage(), value);
        broadcast(alert);
        // Deliver webhook notification for non-INFO alerts
        if (webhookService != null && rule.severity() != Severity.INFO) {
            webhookService.fireAlert(Map.of(
                "id",        alert.getId(),
                "severity",  rule.severity().name(),
                "metric",    rule.metric(),
                "threshold", rule.threshold(),
                "actual",    alert.getActualValue(),
                "message",   alert.getMessage()
            ));
        }
    }

    // ── SSE ───────────────────────────────────────────────────────────────────

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        subscribers.add(emitter);
        emitter.onCompletion(() -> subscribers.remove(emitter));
        emitter.onTimeout(()    -> subscribers.remove(emitter));
        emitter.onError(e       -> subscribers.remove(emitter));
        // Send summary count on connect (avoid serializing LocalDateTime in raw Alert objects)
        try {
            String json = mapper.writeValueAsString(Map.of(
                "total",         firedAlerts.size(),
                "unacknowledged", firedAlerts.stream().filter(a -> !a.isAcknowledged()).count()
            ));
            emitter.send(SseEmitter.event().name("history").data(json));
        } catch (IOException ignored) {}
        return emitter;
    }

    private void broadcast(Alert alert) {
        String json;
        try { json = mapper.writeValueAsString(Map.of(
                "id",          alert.getId(),
                "severity",    alert.getRule().severity().name(),
                "metric",      alert.getRule().metric(),
                "threshold",   alert.getRule().threshold(),
                "actualValue", alert.getActualValue(),
                "message",     alert.getMessage(),
                "timestamp",   alert.getTimestamp().toString(),
                "acknowledged",alert.isAcknowledged()
        )); } catch (Exception e) { return; }

        subscribers.removeIf(emitter -> {
            try { emitter.send(SseEmitter.event().name("alert").data(json)); return false; }
            catch (IOException ex) { return true; }
        });
    }
}

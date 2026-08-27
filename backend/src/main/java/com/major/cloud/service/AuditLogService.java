package com.major.cloud.service;

import lombok.Getter;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Immutable audit trail — every significant action is logged here.
 * Persisted in-memory (last 500 entries), exposed via REST.
 */
@Service
public class AuditLogService {

    public enum ActionType {
        EXPERIMENT_STARTED, EXPERIMENT_COMPLETED,
        CONTAINER_STARTED, CONTAINER_STOPPED,
        CONTAINER_CRASHED, CONTAINER_HEALED,
        ALERT_FIRED, ALERT_ACKNOWLEDGED,
        CONFIG_CHANGED, CHAOS_INJECTED,
        LOAD_GENERATOR_STARTED, LOAD_GENERATOR_STOPPED
    }

    @Getter
    public static class AuditEntry {
        private final long          id;
        private final ActionType    action;
        private final String        actor;      // "SYSTEM" | "USER"
        private final String        resource;   // e.g. strategy name, container ID
        private final String        detail;
        private final LocalDateTime timestamp;
        private final String        severity;  // INFO | WARN | ERROR

        public AuditEntry(long id, ActionType action, String actor,
                          String resource, String detail, String severity) {
            this.id        = id;
            this.action    = action;
            this.actor     = actor;
            this.resource  = resource;
            this.detail    = detail;
            this.timestamp = LocalDateTime.now();
            this.severity  = severity;
        }

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",        id);
            m.put("action",    action.name());
            m.put("actor",     actor);
            m.put("resource",  resource);
            m.put("detail",    detail);
            m.put("timestamp", timestamp.toString());
            m.put("severity",  severity);
            return m;
        }
    }

    private static final int MAX_ENTRIES = 500;
    private final List<AuditEntry>  log      = new CopyOnWriteArrayList<>();
    private final AtomicLong        counter  = new AtomicLong(1);

    // ── Write ──────────────────────────────────────────────────────────────

    public AuditEntry log(ActionType action, String actor, String resource,
                          String detail, String severity) {
        AuditEntry e = new AuditEntry(counter.getAndIncrement(), action, actor, resource, detail, severity);
        log.add(e);
        // Trim oldest entries
        while (log.size() > MAX_ENTRIES) log.remove(0);
        return e;
    }

    public AuditEntry system(ActionType action, String resource, String detail) {
        return log(action, "SYSTEM", resource, detail, "INFO");
    }

    public AuditEntry user(ActionType action, String resource, String detail) {
        return log(action, "USER", resource, detail, "INFO");
    }

    public AuditEntry warn(ActionType action, String resource, String detail) {
        return log(action, "SYSTEM", resource, detail, "WARN");
    }

    // ── Read ───────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getAll() {
        List<AuditEntry> copy = new ArrayList<>(log);
        Collections.reverse(copy);  // newest first
        return copy.stream().map(AuditEntry::toMap).toList();
    }

    public List<Map<String, Object>> getByAction(String actionName) {
        return log.stream()
                .filter(e -> e.getAction().name().equalsIgnoreCase(actionName))
                .sorted(Comparator.comparingLong(AuditEntry::getId).reversed())
                .map(AuditEntry::toMap)
                .toList();
    }

    public Map<String, Object> getStats() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (ActionType t : ActionType.values()) {
            long c = log.stream().filter(e -> e.getAction() == t).count();
            if (c > 0) counts.put(t.name(), c);
        }
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalEntries",    (long) log.size());
        stats.put("actionBreakdown", counts);
        stats.put("oldestEntry",     log.isEmpty() ? "—" : log.get(0).getTimestamp().toString());
        stats.put("newestEntry",     log.isEmpty() ? "—" : log.get(log.size()-1).getTimestamp().toString());
        return stats;
    }
}

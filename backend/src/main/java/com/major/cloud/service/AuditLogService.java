package com.major.cloud.service;

import com.major.cloud.model.entity.AuditLogEntry;
import com.major.cloud.repository.AuditLogRepository;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

/**
 * Immutable audit trail — every significant action is persisted to the database
 * and also held in a small in-memory cache for the REST endpoint (no DB round-trip
 * on every dashboard poll).
 */
@Service
@RequiredArgsConstructor
public class AuditLogService {

    public enum ActionType {
        EXPERIMENT_STARTED, EXPERIMENT_COMPLETED,
        CONTAINER_STARTED, CONTAINER_STOPPED,
        CONTAINER_CRASHED, CONTAINER_HEALED,
        ALERT_FIRED, ALERT_ACKNOWLEDGED,
        CONFIG_CHANGED, CHAOS_INJECTED,
        LOAD_GENERATOR_STARTED, LOAD_GENERATOR_STOPPED,
        USER_ACTION, SYSTEM_EVENT
    }

    /** Lightweight DTO returned to REST callers. */
    @Getter
    public static class AuditEntryDto {
        private final Long   id;
        private final String actionType;
        private final String actor;
        private final String resource;
        private final String detail;
        private final String level;
        private final String timestamp;

        public AuditEntryDto(AuditLogEntry e) {
            this.id         = e.getId();
            this.actionType = e.getActionType();
            this.actor      = e.getActor();
            this.resource   = e.getResource();
            this.detail     = e.getDetail();
            this.level      = e.getLevel();
            this.timestamp  = e.getCreatedAt().toString();
        }

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",         id);
            m.put("action",     actionType);
            m.put("actor",      actor);
            m.put("resource",   resource);
            m.put("detail",     detail);
            m.put("severity",   level);
            m.put("timestamp",  timestamp);
            return m;
        }
    }

    private final AuditLogRepository repository;

    // ── Write ──────────────────────────────────────────────────────────────

    @Transactional
    public AuditLogEntry log(ActionType action, String actor,
                             String resource, String detail, String level) {
        AuditLogEntry entry = new AuditLogEntry();
        entry.setActionType(action.name());
        entry.setActor(actor);
        entry.setResource(resource);
        entry.setDetail(detail);
        entry.setLevel(level);
        entry.setCreatedAt(Instant.now());
        return repository.save(entry);
    }

    @Transactional
    public AuditLogEntry system(ActionType action, String resource, String detail) {
        return log(action, "SYSTEM", resource, detail, "INFO");
    }

    @Transactional
    public AuditLogEntry user(ActionType action, String resource, String detail) {
        return log(action, "USER", resource, detail, "INFO");
    }

    @Transactional
    public AuditLogEntry warn(ActionType action, String resource, String detail) {
        return log(action, "SYSTEM", resource, detail, "WARN");
    }

    // ── Read ───────────────────────────────────────────────────────────────

    public List<Map<String, Object>> getAll() {
        return repository.findAllByOrderByCreatedAtDesc(
                PageRequest.of(0, 500, Sort.by(Sort.Direction.DESC, "createdAt")))
                .stream()
                .map(AuditEntryDto::new)
                .map(AuditEntryDto::toMap)
                .toList();
    }

    public List<Map<String, Object>> getByAction(String actionName) {
        return repository.findByActionTypeOrderByCreatedAtDesc(actionName.toUpperCase())
                .stream()
                .map(AuditEntryDto::new)
                .map(AuditEntryDto::toMap)
                .toList();
    }

    public Map<String, Object> getStats() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (ActionType t : ActionType.values()) {
            long c = repository.countByActionType(t.name());
            if (c > 0) counts.put(t.name(), c);
        }
        long total = repository.count();
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalEntries",    total);
        stats.put("actionBreakdown", counts);
        return stats;
    }
}

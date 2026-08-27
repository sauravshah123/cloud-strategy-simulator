package com.major.cloud.model.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Persistent audit log entry. Replaces the in-memory ring buffer for durable
 * audit trails across restarts.
 */
@Entity
@Table(name = "audit_log", indexes = {
    @Index(name = "idx_audit_created_at", columnList = "created_at"),
    @Index(name = "idx_audit_action_type", columnList = "action_type")
})
@Data
@NoArgsConstructor
public class AuditLogEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "action_type", nullable = false, length = 50)
    private String actionType;

    @Column(name = "actor", length = 100)
    private String actor;   // "SYSTEM" | "user:<username>"

    @Column(name = "resource", length = 100)
    private String resource;

    @Column(name = "detail", length = 1024)
    private String detail;

    @Column(name = "level", length = 10)
    private String level;   // INFO | WARN | ERROR

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}

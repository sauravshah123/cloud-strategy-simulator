package com.major.cloud.model.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Persistent healing event — every container-crash/replacement recorded by
 * AutoHealingEngine is also written to this table for long-term audit.
 */
@Entity
@Table(name = "healing_events", indexes = {
    @Index(name = "idx_healing_strategy", columnList = "strategy"),
    @Index(name = "idx_healing_occurred_at", columnList = "occurred_at")
})
@Data
@NoArgsConstructor
public class HealingEventEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String strategy;

    @Column(name = "crashed_container_id", length = 64)
    private String crashedContainerId;

    @Column(name = "replacement_container_id", length = 64)
    private String replacementContainerId;

    @Column(name = "replica_count")
    private int replicaCount;

    /** DOCKER | SIMULATED */
    @Column(length = 20)
    private String mode;

    @Column(length = 512)
    private String message;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "heal_duration_ms")
    private long healDurationMs;
}

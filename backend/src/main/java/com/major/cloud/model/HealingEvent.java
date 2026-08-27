package com.major.cloud.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Represents one auto-healing event: a container that crashed and was replaced.
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class HealingEvent {
    /** Which strategy group the container belonged to. */
    private String strategy;

    /** Short container ID that crashed (first 12 chars). */
    private String crashedContainerId;

    /** Short container ID of the replacement. */
    private String replacementContainerId;

    /** How many replica containers the strategy currently has. */
    private int replicaCount;

    /** DOCKER | SIMULATED */
    private String mode;

    /** Human-readable description of the event. */
    private String message;

    /** Wall-clock time of detection. */
    private LocalDateTime timestamp;

    /** How many milliseconds the healer took to detect and replace the container. */
    private long healDurationMs;
}

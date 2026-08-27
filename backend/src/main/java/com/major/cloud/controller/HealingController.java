package com.major.cloud.controller;

import com.major.cloud.model.HealingEvent;
import com.major.cloud.service.AutoHealingEngine;
import com.major.cloud.service.DockerOrchestrationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/healing")
@RequiredArgsConstructor
@Tag(name = "Auto-Healing", description = "Self-healing engine — real-time container health monitoring and recovery")
public class HealingController {

    private final AutoHealingEngine healingEngine;
    private final DockerOrchestrationService docker;

    /* ── SSE stream ───────────────────────────────────────────── */

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "SSE stream of healing events",
               description = "Subscribe to receive real-time HealingEvent pushes as containers crash and recover")
    public SseEmitter stream() {
        return healingEngine.subscribe();
    }

    /* ── Status snapshot ──────────────────────────────────────── */

    @GetMapping("/status")
    @Operation(summary = "Engine status", description = "Returns live state: mode, active, replica counts, total heals")
    public ResponseEntity<Map<String, Object>> status() {
        return ResponseEntity.ok(healingEngine.getStatus());
    }

    /* ── Full history ─────────────────────────────────────────── */

    @GetMapping("/history")
    @Operation(summary = "Healing event history", description = "Returns every healing event since the app started")
    public ResponseEntity<List<HealingEvent>> history() {
        return ResponseEntity.ok(healingEngine.getHistory());
    }

    /* ── Manual arm/disarm ────────────────────────────────────── */

    @PostMapping("/arm")
    @Operation(summary = "Arm the healing engine",
               description = "Arms the healer for a given Docker image (or simulation if Docker is unavailable)")
    public ResponseEntity<Map<String, Object>> arm(@RequestParam(defaultValue = "") String image) {
        String img = image.trim().isEmpty() ? null : image.trim();
        healingEngine.startExperiment(img);
        return ResponseEntity.ok(Map.of(
                "status", "ARMED",
                "mode",   healingEngine.getMode(),
                "image",  img != null ? img : "none (simulation)"
        ));
    }

    @PostMapping("/disarm")
    @Operation(summary = "Disarm the healing engine")
    public ResponseEntity<Map<String, Object>> disarm() {
        healingEngine.stopExperiment();
        return ResponseEntity.ok(Map.of("status", "DISARMED", "totalHeals", healingEngine.getTotalHeals()));
    }

    /* ── Chaos inject ─────────────────────────────────────────── */

    @PostMapping("/chaos")
    @Operation(summary = "Inject a crash",
               description = "Immediately kills one container for the given strategy to trigger self-healing")
    public ResponseEntity<Map<String, Object>> injectChaos(
            @RequestParam(defaultValue = "CPU") String strategy) {

        if (!docker.isDockerAvailable()) {
            return ResponseEntity.ok(Map.of(
                    "status",  "SIMULATED",
                    "message", "Docker not available. The simulated healer will generate a synthetic crash automatically every few seconds."
            ));
        }

        if (!healingEngine.isActive()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "status",  "NOT_ARMED",
                    "message", "Arm the healing engine first via POST /api/healing/arm"
            ));
        }

        List<String> containers = docker.getActiveContainers(strategy);
        if (containers.isEmpty()) {
            return ResponseEntity.ok(Map.of(
                    "status",  "NO_CONTAINERS",
                    "message", "No containers running for strategy '" + strategy + "'. Run an experiment first."
            ));
        }

        String target = containers.get(0);
        docker.stopSpecificContainer(strategy, target);
        log.warn("💥 CHAOS injected: killed {} for strategy {}", target.substring(0, 8), strategy);

        return ResponseEntity.ok(Map.of(
                "status",    "CRASHED",
                "container", target.length() > 12 ? target.substring(0, 12) : target,
                "strategy",  strategy,
                "message",   "Container crashed. Watch the SSE stream — healer will auto-recover in ≤3 s."
        ));
    }
}

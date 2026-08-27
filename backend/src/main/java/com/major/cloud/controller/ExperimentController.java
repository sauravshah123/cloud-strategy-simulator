package com.major.cloud.controller;

import com.major.cloud.service.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Experiments", description = "Run scaling strategy experiments")
public class ExperimentController {

    private final ExperimentService      experimentService;
    private final CostCalculationService costService;
    private final SlaTrackerService      slaTrackerService;
    private final AuditLogService        auditLogService;

    // In-memory experiment history (last 10 runs)
    private final LinkedList<Map<String, Object>> history = new LinkedList<>();

    @PostMapping("/experiment")
    @Operation(summary = "Run a scaling experiment")
    public ResponseEntity<Map<String, Object>> runExperiment(
            @RequestBody(required = false) Map<String, Object> request) {
        try {
            // ── Parse request (robust defaults) ──────────────────────
            if (request == null) request = new LinkedHashMap<>();

            @SuppressWarnings("unchecked")
            List<String> strategies = (List<String>) request.getOrDefault(
                    "strategies", List.of("CPU", "TREND", "LATENCY"));
            String dockerImage = (String) request.get("dockerImage");

            log.info("Starting experiment — strategies={}, docker={}", strategies, dockerImage);

            auditLogService.user(AuditLogService.ActionType.EXPERIMENT_STARTED,
                    "EXPERIMENT", "strategies=" + strategies + " image=" + dockerImage);

            // ── Core simulation ───────────────────────────────────────
            Map<String, Object> response = experimentService.runExperimentDetailed(strategies, dockerImage);

            // runExperimentDetailed returns Map.of() on image-pull failure → immutable
            // We always want a mutable response to enrich with cost/SLA data
            response = new LinkedHashMap<>(response);

            // ── Cost analysis ─────────────────────────────────────────
            try {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> stratResults =
                        (List<Map<String, Object>>) response.get("strategies");

                if (stratResults != null && !stratResults.isEmpty()) {
                    int durationSecs = dockerImage != null && !dockerImage.isBlank() ? 30 : 10;
                    List<Map<String, Object>> costs =
                            costService.compareStrategyCosts(stratResults, durationSecs);
                    response.put("costAnalysis", costs);

                    if (!costs.isEmpty()) {
                        double bestCph = (double) costs.get(0).get("costPerHourUsd");
                        response.put("costProjection", costService.monthlyProjection(bestCph));
                        response.put("bestStrategyCostPerHour", bestCph);
                    }

                    // ── SLA ticks ─────────────────────────────────────
                    for (Map<String, Object> s : stratResults) {
                        String name = (String) s.get("strategy");
                        @SuppressWarnings("unchecked")
                        List<Integer> timeline =
                                (List<Integer>) s.getOrDefault("replicaTimeline", List.of(2));
                        for (int replicas : timeline) slaTrackerService.recordTick(name, replicas);
                    }
                    response.put("slaSnapshot", slaTrackerService.getAllSummaries());
                }
            } catch (Exception costEx) {
                log.warn("Cost/SLA enrichment failed (non-fatal): {}", costEx.getMessage());
                // Don't fail the whole request — just omit cost data
            }

            auditLogService.system(AuditLogService.ActionType.EXPERIMENT_COMPLETED,
                    "EXPERIMENT", "best=" + response.get("bestStrategy")
                    + " cpu=" + response.get("peakCpuUsage") + "%");

            // ── History ───────────────────────────────────────────────
            Map<String, Object> historyEntry = new LinkedHashMap<>(response);
            historyEntry.put("runAt", System.currentTimeMillis());
            synchronized (history) {
                if (history.size() >= 10) history.removeLast();
                history.addFirst(historyEntry);
            }

            log.info("Experiment complete — best={}", response.get("bestStrategy"));
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("Experiment failed: {}", e.getMessage(), e);
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("status",  "ERROR");
            err.put("message", e.getMessage());
            err.put("error",   e.getClass().getSimpleName());
            return ResponseEntity.internalServerError().body(err);
        }
    }

    @GetMapping("/history")
    @Operation(summary = "Experiment history (last 10 runs)")
    public ResponseEntity<List<Map<String, Object>>> getHistory() {
        synchronized (history) {
            return ResponseEntity.ok(new ArrayList<>(history));
        }
    }
}

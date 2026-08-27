package com.major.cloud.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.major.cloud.model.entity.ExperimentRunEntity;
import com.major.cloud.repository.ExperimentRunRepository;
import com.major.cloud.service.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
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
    private final WebhookService         webhookService;
    private final ExperimentRunRepository experimentRunRepository;
    private final ObjectMapper           objectMapper = new ObjectMapper();

    // In-memory experiment history (last 10 runs) — fast read for dashboard
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

            // ── Persist to DB ─────────────────────────────────────────
            try {
                ExperimentRunEntity run = new ExperimentRunEntity();
                run.setRunAt(Instant.now());
                run.setBestStrategy((String) response.get("bestStrategy"));
                run.setPeakCpuUsage(toDouble(response.get("peakCpuUsage")));
                run.setPeakMemUsage(toDouble(response.get("peakMemUsage")));
                run.setAvgCpuUsage(toDouble(response.get("avgCpuUsage")));
                run.setSampleCount(toInt(response.get("sampleCount")));
                run.setDockerImage((String) response.get("dockerImage"));
                run.setResultJson(objectMapper.writeValueAsString(historyEntry));
                experimentRunRepository.save(run);
            } catch (Exception dbEx) {
                log.warn("Failed to persist experiment to DB (non-fatal): {}", dbEx.getMessage());
            }

            log.info("Experiment complete — best={}", response.get("bestStrategy"));

            // Fire webhook for experiment completion
            try {
                final Map<String, Object> summary = Map.of(
                    "bestStrategy", String.valueOf(response.get("bestStrategy")),
                    "peakCpuUsage", response.getOrDefault("peakCpuUsage", 0),
                    "timestamp",    System.currentTimeMillis()
                );
                webhookService.fireExperiment(summary);
            } catch (Exception ignored) {}

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
        // Return in-memory cache if populated; fall back to DB
        synchronized (history) {
            if (!history.isEmpty()) {
                return ResponseEntity.ok(new ArrayList<>(history));
            }
        }
        // DB fallback — deserialize stored JSON
        List<Map<String, Object>> dbHistory = experimentRunRepository
                .findTop10ByOrderByRunAtDesc()
                .stream()
                .map(run -> {
                    try {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> m = objectMapper.readValue(run.getResultJson(), Map.class);
                        return m;
                    } catch (Exception e) {
                        return Map.of("id", run.getId(), "runAt", run.getRunAt().toEpochMilli(),
                                "bestStrategy", String.valueOf(run.getBestStrategy()));
                    }
                })
                .toList();
        return ResponseEntity.ok(dbHistory);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private static Double toDouble(Object v) {
        if (v instanceof Number n) return n.doubleValue();
        return null;
    }
    private static Integer toInt(Object v) {
        if (v instanceof Number n) return n.intValue();
        return null;
    }
}

package com.major.cloud.controller;

import com.major.cloud.service.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Experiments", description = "Run scaling strategy experiments against live system metrics")
public class ExperimentController {

    private final ExperimentService      experimentService;
    private final MonitoringService      monitoringService;
    private final CostCalculationService costService;
    private final SlaTrackerService      slaTrackerService;
    private final AuditLogService        auditLogService;

    // In-memory experiment history (last 10 runs)
    private final LinkedList<Map<String, Object>> history = new LinkedList<>();

    @PostMapping("/experiment")
    @Operation(summary = "Run a scaling experiment",
               description = "Samples 10 seconds of real OS metrics and simulates all 3 strategies. " +
                             "Pass dockerImage to run real Docker containers.")
    public ResponseEntity<Map<String, Object>> runExperiment(@RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<String> strategies = (List<String>) request.getOrDefault("strategies",
                                  List.of("CPU", "TREND", "LATENCY"));
        String dockerImage = (String) request.get("dockerImage");

        auditLogService.user(AuditLogService.ActionType.EXPERIMENT_STARTED,
                "EXPERIMENT", "Strategies: " + strategies + ", image: " + dockerImage);

        Map<String, Object> response = experimentService.runExperimentDetailed(strategies, dockerImage);

        // ── Enrich with cost analysis ─────────────────────────────────
        int durationSecs = dockerImage != null ? 30 : 10;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> stratResults = (List<Map<String, Object>>) response.get("strategies");
        if (stratResults != null) {
            List<Map<String, Object>> costs = costService.compareStrategyCosts(stratResults, durationSecs);
            response.put("costAnalysis", costs);

            // Best strategy cost projection
            costs.stream().findFirst().ifPresent(best -> {
                double bestCph = (double) best.get("costPerHourUsd");
                response.put("costProjection", costService.monthlyProjection(bestCph));
                response.put("bestStrategyCostPerHour", bestCph);
            });
        }

        // ── Record SLA ticks for each strategy ───────────────────────
        if (stratResults != null) {
            for (Map<String, Object> s : stratResults) {
                String name = (String) s.get("strategy");
                @SuppressWarnings("unchecked")
                List<Integer> timeline = (List<Integer>) s.getOrDefault("replicaTimeline", List.of(2));
                for (int replicas : timeline) {
                    slaTrackerService.recordTick(name, replicas);
                }
            }
            response.put("slaSnapshot", slaTrackerService.getAllSummaries());
        }

        auditLogService.system(AuditLogService.ActionType.EXPERIMENT_COMPLETED,
                "EXPERIMENT", "Best: " + response.get("bestStrategy") +
                ", CPU peak: " + response.get("peakCpuUsage") + "%");

        // ── Save to history ───────────────────────────────────────────
        Map<String, Object> historyEntry = new LinkedHashMap<>(response);
        historyEntry.put("runAt", System.currentTimeMillis());
        synchronized (history) {
            if (history.size() >= 10) history.removeLast();
            history.addFirst(historyEntry);
        }
        return ResponseEntity.ok(response);
    }

    @GetMapping("/history")
    @Operation(summary = "Experiment history (last 10 runs)")
    public ResponseEntity<List<Map<String, Object>>> getHistory() {
        synchronized (history) {
            return ResponseEntity.ok(new ArrayList<>(history));
        }
    }

    @GetMapping("/metrics")
    @Operation(summary = "Current server metrics snapshot")
    public ResponseEntity<Map<String, Object>> getMetrics() {
        double cpu = monitoringService.getRealCpuUsage();
        double mem = monitoringService.getRealMemoryUsage();
        return ResponseEntity.ok(Map.of(
                "cpuUsage",    Math.round(cpu * 10.0) / 10.0,
                "memoryUsage", Math.round(mem * 10.0) / 10.0,
                "status",      cpu > 80 ? "HIGH" : cpu > 50 ? "MEDIUM" : "LOW",
                "timestamp",   System.currentTimeMillis()
        ));
    }
}

package com.major.cloud.controller;

import com.major.cloud.model.ExperimentResult;
import com.major.cloud.service.ExperimentService;
import com.major.cloud.service.MonitoringService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.List;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ExperimentController {

    private final ExperimentService experimentService;
    private final MonitoringService monitoringService;

    @PostMapping("/experiment")
    public ResponseEntity<ExperimentResult> runExperiment(@RequestBody List<String> strategies) {
        ExperimentResult result = experimentService.runExperiment(strategies);
        return ResponseEntity.ok(result);
    }

    /** Live metrics endpoint — returns real CPU & memory right now (no experiment needed) */
    @GetMapping("/metrics")
    public ResponseEntity<Map<String, Object>> getLiveMetrics() {
        double cpu = monitoringService.getRealCpuUsage();
        double mem = monitoringService.getRealMemoryUsage();
        return ResponseEntity.ok(Map.of(
            "cpuUsage", Math.round(cpu * 10.0) / 10.0,
            "memoryUsage", Math.round(mem * 10.0) / 10.0,
            "status", cpu > 80 ? "HIGH" : cpu > 50 ? "MEDIUM" : "LOW"
        ));
    }
}

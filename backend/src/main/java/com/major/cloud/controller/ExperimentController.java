package com.major.cloud.controller;

import com.major.cloud.model.ExperimentResult;
import com.major.cloud.service.ExperimentService;
import com.major.cloud.service.MonitoringService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ExperimentController {

    private final ExperimentService experimentService;
    private final MonitoringService monitoringService;

    // In-memory experiment history (last 10 runs)
    private final LinkedList<Map<String, Object>> history = new LinkedList<>();

    @PostMapping("/experiment")
    public ResponseEntity<Map<String, Object>> runExperiment(@RequestBody Map<String, Object> request) {
        @SuppressWarnings("unchecked")
        List<String> strategies = (List<String>) request.getOrDefault("strategies", List.of("CPU", "TREND", "LATENCY"));

        // Run experiment and get all strategy results
        Map<String, Object> response = experimentService.runExperimentDetailed(strategies);

        // Save to history
        Map<String, Object> historyEntry = new LinkedHashMap<>(response);
        historyEntry.put("runAt", System.currentTimeMillis());
        synchronized (history) {
            if (history.size() >= 10) history.removeLast();
            history.addFirst(historyEntry);
        }
        return ResponseEntity.ok(response);
    }

    @GetMapping("/history")
    public ResponseEntity<List<Map<String, Object>>> getHistory() {
        synchronized (history) {
            return ResponseEntity.ok(new ArrayList<>(history));
        }
    }
}

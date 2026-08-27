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
        // --- Input validation: produce a clear 400 instead of an opaque parse error ---
        Object rawStrategies = request.get("strategies");
        List<String> strategies;
        if (rawStrategies == null) {
            // Default when not provided
            strategies = List.of("CPU", "TREND", "LATENCY");
        } else if (rawStrategies instanceof List<?> rawList) {
            try {
                //noinspection unchecked
                strategies = (List<String>) rawList;
                if (strategies.isEmpty()) {
                    return ResponseEntity.badRequest().body(Map.of(
                        "error",   "INVALID_REQUEST",
                        "message", "'strategies' must be a non-empty array, e.g. [\"CPU\", \"TREND\", \"LATENCY\"]"
                    ));
                }
            } catch (ClassCastException e) {
                return ResponseEntity.badRequest().body(Map.of(
                    "error",   "INVALID_REQUEST",
                    "message", "Each element of 'strategies' must be a string."
                ));
            }
        } else {
            return ResponseEntity.badRequest().body(Map.of(
                "error",   "INVALID_REQUEST",
                "message", "'strategies' must be a JSON array of strings, e.g. [\"CPU\", \"TREND\", \"LATENCY\"]. " +
                           "Make sure you send Content-Type: application/json."
            ));
        }

        String dockerImage = (String) request.get("dockerImage");

        Map<String, Object> response = experimentService.runExperimentDetailed(strategies, dockerImage);

        // If the service itself signalled an error (e.g. image pull failure), return 400
        if (response.containsKey("error")) {
            return ResponseEntity.badRequest().body(response);
        }

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

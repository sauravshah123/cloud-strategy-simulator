package com.major.cloud.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

@RestController
@RequestMapping("/api/load")
@Tag(name = "Load Generator", description = "Generate real CPU load on the server for dramatic experiment results")
public class LoadGeneratorController {

    private final AtomicBoolean running = new AtomicBoolean(false);
    private final ExecutorService workers = Executors.newFixedThreadPool(
        Math.max(1, Runtime.getRuntime().availableProcessors()));

    @PostMapping("/start")
    @Operation(summary = "Start CPU load", description = "Spins up CPU-intensive work across all cores for N seconds")
    public ResponseEntity<Map<String, Object>> startLoad(@RequestParam(defaultValue = "12") int durationSeconds) {
        if (running.getAndSet(true)) {
            return ResponseEntity.ok(Map.of("status", "ALREADY_RUNNING", "message", "Load generator is already active"));
        }

        int cores = Runtime.getRuntime().availableProcessors();
        // Submit CPU-spinning tasks to each core
        for (int i = 0; i < cores; i++) {
            workers.submit(() -> {
                long end = System.currentTimeMillis() + durationSeconds * 1000L;
                // Tight loop — pegs the core
                while (System.currentTimeMillis() < end && running.get()) {
                    Math.sqrt(Math.random() * 999999);
                }
            });
        }

        // Auto-stop after duration
        Executors.newSingleThreadScheduledExecutor()
            .schedule(() -> running.set(false), durationSeconds, TimeUnit.SECONDS);

        return ResponseEntity.ok(Map.of(
            "status",          "STARTED",
            "cores",           cores,
            "durationSeconds", durationSeconds,
            "message",         "CPU load started on " + cores + " cores for " + durationSeconds + "s"
        ));
    }

    @PostMapping("/stop")
    @Operation(summary = "Stop CPU load", description = "Immediately stops the CPU load generator")
    public ResponseEntity<Map<String, Object>> stopLoad() {
        running.set(false);
        return ResponseEntity.ok(Map.of("status", "STOPPED", "message", "CPU load stopped"));
    }

    @GetMapping("/status")
    @Operation(summary = "Load status", description = "Check if the CPU load generator is active")
    public ResponseEntity<Map<String, Object>> status() {
        return ResponseEntity.ok(Map.of(
            "active",  running.get(),
            "cores",   Runtime.getRuntime().availableProcessors()
        ));
    }
}

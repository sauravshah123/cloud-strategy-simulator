package com.major.cloud.controller;

import com.major.cloud.service.DockerOrchestrationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/chaos")
@RequiredArgsConstructor
@Tag(name = "Chaos Engineering", description = "Simulate container failures to test self-healing")
public class ChaosController {

    private final DockerOrchestrationService dockerOrchestrationService;

    @PostMapping("/crash")
    @Operation(summary = "Crash a container", description = "Forcefully stops one container for the given strategy to trigger self-healing")
    public ResponseEntity<Map<String, Object>> crashContainer(
            @RequestParam(defaultValue = "CPU") String strategy) {

        if (!dockerOrchestrationService.isDockerAvailable()) {
            return ResponseEntity.ok(Map.of(
                    "status",  "SKIPPED",
                    "message", "Docker daemon is not available on this host. " +
                               "Chaos engineering requires a Docker-enabled backend."
            ));
        }

        List<String> containers = dockerOrchestrationService.getActiveContainers(strategy);
        if (containers.isEmpty()) {
            return ResponseEntity.ok(Map.of(
                    "status",  "NO_CONTAINERS",
                    "message", "No active containers found for strategy '" + strategy +
                               "'. Start an experiment with a Docker image first."
            ));
        }

        String containerId = containers.get(0);
        try {
            log.warn("💥 CHAOS: Manually crashing container {} for strategy {}", containerId.substring(0, 8), strategy);
            dockerOrchestrationService.stopSpecificContainer(strategy, containerId);
            return ResponseEntity.ok(Map.of(
                    "status",      "CRASHED",
                    "containerId", containerId.substring(0, 12),
                    "strategy",    strategy,
                    "message",     "Crashed container " + containerId.substring(0, 8) +
                                   ". Self-healer will detect this within 1-2 seconds and spin up a replacement."
            ));
        } catch (Exception e) {
            log.error("Chaos crash failed", e);
            return ResponseEntity.internalServerError().body(Map.of(
                    "status",  "ERROR",
                    "message", e.getMessage()
            ));
        }
    }

    @GetMapping("/status")
    @Operation(summary = "Docker & chaos status")
    public ResponseEntity<Map<String, Object>> status() {
        boolean available = dockerOrchestrationService.isDockerAvailable();
        return ResponseEntity.ok(Map.of(
                "dockerAvailable",   available,
                "cpuContainers",     dockerOrchestrationService.getActiveContainers("CPU").size(),
                "trendContainers",   dockerOrchestrationService.getActiveContainers("TREND").size(),
                "latencyContainers", dockerOrchestrationService.getActiveContainers("LATENCY").size()
        ));
    }
}

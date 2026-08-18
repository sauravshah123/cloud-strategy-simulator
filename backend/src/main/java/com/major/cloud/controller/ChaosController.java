package com.major.cloud.controller;

import com.major.cloud.service.DockerOrchestrationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/chaos")
@RequiredArgsConstructor
@Tag(name = "Chaos Engineering", description = "Simulate failures to test self-healing")
public class ChaosController {

    private final DockerOrchestrationService dockerOrchestrationService;

    @PostMapping("/crash")
    @Operation(summary = "Crash a container", description = "Randomly stops a container for the given strategy to trigger self-healing")
    public ResponseEntity<Map<String, Object>> crashContainer(@RequestParam(defaultValue = "CPU") String strategy) {
        List<String> activeContainers = dockerOrchestrationService.getActiveContainers(strategy);
        
        if (activeContainers.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "status", "FAILED",
                    "message", "No active containers found for strategy: " + strategy
            ));
        }

        // Pick the first one (or could be random)
        String containerId = activeContainers.get(0);
        
        try {
            // Forcefully stop the container to simulate a crash
            log.info("CHAOS: Manually crashing container {}", containerId);
            dockerOrchestrationService.stopSpecificContainer(strategy, containerId);
            
            return ResponseEntity.ok(Map.of(
                    "status", "CRASHED",
                    "containerId", containerId,
                    "strategy", strategy,
                    "message", "Successfully crashed container " + containerId.substring(0, 8) + ". Self-healer should detect this shortly."
            ));
        } catch (Exception e) {
            log.error("Failed to execute chaos crash", e);
            return ResponseEntity.internalServerError().body(Map.of("status", "ERROR", "message", e.getMessage()));
        }
    }
}

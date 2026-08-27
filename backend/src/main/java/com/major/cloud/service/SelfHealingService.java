package com.major.cloud.service;

import com.major.cloud.model.ScalingEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class SelfHealingService {

    private final DockerOrchestrationService dockerOrchestrationService;

    // Store healing events per strategy for the current experiment
    private final Map<String, List<ScalingEvent>> healingEvents = new ConcurrentHashMap<>();

    public void clearEvents() {
        healingEvents.clear();
    }

    public List<ScalingEvent> getHealingEvents(String strategyName) {
        return healingEvents.getOrDefault(strategyName, new ArrayList<>());
    }

    /**
     * Checks all active containers for the strategy and restarts any that
     * are no longer running (crashed). Returns the number of heals performed.
     * Iterates a snapshot copy to avoid ConcurrentModificationException.
     */
    public int checkAndHeal(String strategyName, String image) {
        if (!dockerOrchestrationService.isDockerAvailable()) return 0;

        // Take a snapshot so stopSpecificContainer doesn't modify the list we are iterating
        List<String> snapshot = new ArrayList<>(dockerOrchestrationService.getActiveContainers(strategyName));
        int healed = 0;

        for (String containerId : snapshot) {
            if (!dockerOrchestrationService.isRunning(containerId)) {
                log.warn("⚠️ SELF-HEAL: Container {} for strategy {} is down. Restarting...",
                        shortId(containerId), strategyName);

                int oldCount = dockerOrchestrationService.getActiveContainers(strategyName).size();
                dockerOrchestrationService.stopSpecificContainer(strategyName, containerId);
                String newId = dockerOrchestrationService.startContainer(strategyName, image);

                if (newId != null) {
                    ScalingEvent event = new ScalingEvent(
                            strategyName,
                            oldCount,
                            oldCount, // replica count stays the same, just replaced
                            "SELF-HEAL: Replaced crashed container " + shortId(containerId),
                            java.time.LocalDateTime.now()
                    );
                    healingEvents.computeIfAbsent(strategyName, k -> new ArrayList<>()).add(event);
                    healed++;
                    log.info("✅ SELF-HEAL: Replacement container {} started.", shortId(newId));
                } else {
                    log.error("❌ SELF-HEAL: Could not start replacement for container {} — image may be unavailable.", shortId(containerId));
                }
            }
        }
        return healed;
    }

    /** Safe short ID — avoids StringIndexOutOfBoundsException on unexpectedly short IDs. */
    private static String shortId(String id) {
        if (id == null) return "<null>";
        return id.length() > 8 ? id.substring(0, 8) : id;
    }
}

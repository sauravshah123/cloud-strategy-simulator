package com.major.cloud.service;

import com.major.cloud.model.ScalingEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
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
     */
    public int checkAndHeal(String strategyName, String image) {
        if (!dockerOrchestrationService.isDockerAvailable()) return 0;

        List<String> activeContainers = dockerOrchestrationService.getActiveContainers(strategyName);
        int healed = 0;

        for (String containerId : activeContainers) {
            if (!dockerOrchestrationService.isRunning(containerId)) {
                log.warn("⚠️ SELF-HEAL: Container {} for strategy {} is down. Restarting...",
                        containerId.substring(0, 8), strategyName);

                int oldCount = dockerOrchestrationService.getActiveContainers(strategyName).size();
                dockerOrchestrationService.stopSpecificContainer(strategyName, containerId);
                String newId = dockerOrchestrationService.startContainer(strategyName, image);

                if (newId != null) {
                    ScalingEvent event = new ScalingEvent(
                            strategyName,
                            oldCount,
                            oldCount, // replica count stays the same, just replaced
                            "SELF-HEAL: Replaced crashed container " + containerId.substring(0, 8),
                            LocalDateTime.now()
                    );
                    healingEvents.computeIfAbsent(strategyName, k -> new ArrayList<>()).add(event);
                    healed++;
                    log.info("✅ SELF-HEAL: Replacement container {} started.", newId.substring(0, 8));
                }
            }
        }
        return healed;
    }
}

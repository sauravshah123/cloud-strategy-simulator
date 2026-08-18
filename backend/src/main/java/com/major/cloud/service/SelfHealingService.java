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

    public void checkAndHeal(String strategyName, String image) {
        List<String> activeContainers = new ArrayList<>(dockerOrchestrationService.getActiveContainers(strategyName));
        
        for (String containerId : activeContainers) {
            if (!dockerOrchestrationService.isRunning(containerId)) {
                log.warn("Container {} for strategy {} is down! Initiating self-healing...", containerId, strategyName);
                
                // Remove dead container and start new one
                dockerOrchestrationService.stopSpecificContainer(strategyName, containerId);
                String newContainerId = dockerOrchestrationService.startContainer(strategyName, image);
                
                if (newContainerId != null) {
                    ScalingEvent event = new ScalingEvent(
                            strategyName,
                            activeContainers.size(),
                            activeContainers.size(), // Replicas remain the same, just replaced
                            "SELF-HEAL: Replaced crashed container " + containerId.substring(0, 8),
                            LocalDateTime.now()
                    );
                    healingEvents.computeIfAbsent(strategyName, k -> new ArrayList<>()).add(event);
                }
            }
        }
    }
}

package com.major.cloud.service;

import com.major.cloud.model.ExperimentResult;
import com.major.cloud.model.ScalingEvent;
import com.major.cloud.strategy.ScalingStrategy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExperimentService {

    private final StrategyEngine strategyEngine;
    private final ScalingService scalingService;
    private final MonitoringService monitoringService;
    private final DockerOrchestrationService dockerOrchestrationService;
    private final SelfHealingService selfHealingService;

    /** Full experiment — returns timeline data per step for charting */
    public Map<String, Object> runExperimentDetailed(List<String> strategyNames, String dockerImage) {
        boolean useDocker = dockerImage != null && !dockerImage.trim().isEmpty();
        
        if (useDocker) {
            log.info("Starting Docker-based experiment with image: {}", dockerImage);
            dockerOrchestrationService.pullImage(dockerImage);
            selfHealingService.clearEvents();
        }

        // Increase sample size to 30 for docker to allow time for containers to start/stop
        int samples = useDocker ? 30 : 10;
        List<MonitoringService.Workload> wave = monitoringService.generateTrafficWave(samples);

        double peakCpu = wave.stream().mapToDouble(w -> w.cpuUsage).max().orElse(0);
        double peakMem = wave.stream().mapToDouble(w -> w.memoryUsage).max().orElse(0);
        double avgCpu  = wave.stream().mapToDouble(w -> w.cpuUsage).average().orElse(0);
        double avgMem  = wave.stream().mapToDouble(w -> w.memoryUsage).average().orElse(0);

        List<Double> cpuTimeline = new ArrayList<>();
        List<Double> memTimeline = new ArrayList<>();
        for (MonitoringService.Workload w : wave) {
            cpuTimeline.add(Math.round(w.cpuUsage * 10.0) / 10.0);
            memTimeline.add(Math.round(w.memoryUsage * 10.0) / 10.0);
        }

        List<Map<String, Object>> allResults = new ArrayList<>();
        Map<String, Object> bestResult = null;
        double bestLatency = Double.MAX_VALUE;

        try {
            for (String name : strategyNames) {
                ScalingStrategy strategy = strategyEngine.getStrategy(name);
                if (strategy == null) continue;

                Map<String, Object> entry = simulateStrategyDetailed(strategy, wave, useDocker, dockerImage);
                allResults.add(entry);

                double lat = (double) entry.get("averageResponseTime");
                if (lat < bestLatency) {
                    bestLatency = lat;
                    bestResult  = entry;
                }
            }
        } finally {
            if (useDocker) {
                dockerOrchestrationService.cleanupAll();
            }
        }

        allResults.sort(Comparator.comparingDouble(e -> (double) e.get("averageResponseTime")));

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("strategies",    allResults);
        response.put("bestStrategy",  bestResult != null ? bestResult.get("strategy") : "NONE");
        response.put("peakCpuUsage",  Math.round(peakCpu * 10.0) / 10.0);
        response.put("peakMemUsage",  Math.round(peakMem * 10.0) / 10.0);
        response.put("avgCpuUsage",   Math.round(avgCpu  * 10.0) / 10.0);
        response.put("avgMemUsage",   Math.round(avgMem  * 10.0) / 10.0);
        response.put("sampleCount",   wave.size());
        response.put("timestamp",     System.currentTimeMillis());
        response.put("cpuTimeline",   cpuTimeline);
        response.put("memTimeline",   memTimeline);
        response.put("dockerImage",   dockerImage);

        if (bestResult != null) {
            response.put("finalReplicas",       bestResult.get("finalReplicas"));
            response.put("averageResponseTime", bestResult.get("averageResponseTime"));
            response.put("scalingEvents",       bestResult.get("scalingEvents"));
        }
        return response;
    }

    private Map<String, Object> simulateStrategyDetailed(
            ScalingStrategy strategy,
            List<MonitoringService.Workload> wave,
            boolean useDocker, String dockerImage) {

        int replicas = 2;
        String stratName = strategy.getStrategyName();
        
        if (useDocker) {
            // Start initial replicas
            for (int i = 0; i < replicas; i++) {
                dockerOrchestrationService.startContainer(stratName, dockerImage);
            }
        }

        double totalLatency = 0;
        List<ScalingEvent> events = new ArrayList<>();
        List<Integer> replicaTimeline = new ArrayList<>();
        List<Double>  latencyTimeline = new ArrayList<>();

        for (MonitoringService.Workload w : wave) {
            
            if (useDocker) {
                selfHealingService.checkAndHeal(stratName, dockerImage);
                // Adjust replicas based on actual running containers
                replicas = dockerOrchestrationService.getActiveContainers(stratName).size();
                if (replicas == 0) replicas = 1; // avoid division by zero
            }

            double latency = monitoringService.calculateLatency(w.trafficBase, replicas);
            totalLatency += latency;
            replicaTimeline.add(replicas);
            latencyTimeline.add(Math.round(latency * 10.0) / 10.0);

            Optional<ScalingEvent> event = scalingService.applyStrategy(
                strategy, replicas, w.cpuUsage, w.trend, latency);
                
            if (event.isPresent()) {
                ScalingEvent e = event.get();
                events.add(e);
                int targetReplicas = e.getNewReplicas();
                
                if (useDocker) {
                    if (targetReplicas > replicas) {
                        for (int i = 0; i < (targetReplicas - replicas); i++) {
                            dockerOrchestrationService.startContainer(stratName, dockerImage);
                        }
                    } else if (targetReplicas < replicas) {
                        for (int i = 0; i < (replicas - targetReplicas); i++) {
                            dockerOrchestrationService.stopContainer(stratName);
                        }
                    }
                }
                replicas = targetReplicas;
            }
        }

        if (useDocker) {
            // Add healing events
            List<ScalingEvent> heals = selfHealingService.getHealingEvents(stratName);
            events.addAll(heals);
            // Sort combined events
            events.sort(Comparator.comparing(ScalingEvent::getTimestamp));
        }

        double avgLatency = totalLatency / wave.size();

        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("strategy",            stratName);
        entry.put("finalReplicas",       replicas);
        entry.put("averageResponseTime", Math.round(avgLatency * 10.0) / 10.0);
        entry.put("scalingEvents",       events);
        entry.put("scalingEventCount",   events.size());
        entry.put("healingEventCount",   useDocker ? selfHealingService.getHealingEvents(stratName).size() : 0);
        entry.put("replicaTimeline",     replicaTimeline);
        entry.put("latencyTimeline",     latencyTimeline);
        return entry;
    }
}

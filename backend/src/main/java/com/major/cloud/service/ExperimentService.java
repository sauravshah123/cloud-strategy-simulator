package com.major.cloud.service;

import com.major.cloud.model.ExperimentResult;
import com.major.cloud.model.ScalingEvent;
import com.major.cloud.strategy.ScalingStrategy;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class ExperimentService {

    private final StrategyEngine strategyEngine;
    private final ScalingService scalingService;
    private final MonitoringService monitoringService;

    public ExperimentResult runExperiment(List<String> strategyNames) {
        List<ExperimentResult> results = new ArrayList<>();
        
        // Generate ONE shared traffic wave so all strategies face the exact same conditions
        List<MonitoringService.Workload> wave = monitoringService.generateTrafficWave(15);

        for (String name : strategyNames) {
            ScalingStrategy strategy = strategyEngine.getStrategy(name);
            if (strategy != null) {
                results.add(simulateStrategy(strategy, wave));
            }
        }

        if (results.isEmpty()) {
            return new ExperimentResult("NONE", 0, 0, new ArrayList<>());
        }

        ExperimentResult bestResult = results.stream()
                .min(Comparator.comparingDouble(ExperimentResult::getAverageResponseTime))
                .orElse(results.get(0));

        String bestName = results.stream()
                .min(Comparator.comparingDouble(ExperimentResult::getAverageResponseTime))
                .map(r -> strategyNames.get(results.indexOf(r)))
                .orElse("UNKNOWN");
        
        bestResult.setBestStrategy(bestName);

        return bestResult;
    }

    private ExperimentResult simulateStrategy(ScalingStrategy strategy, List<MonitoringService.Workload> wave) {
        int replicas = 2;
        double totalLatency = 0;
        List<ScalingEvent> events = new ArrayList<>();

        for (MonitoringService.Workload w : wave) {
            double cpu = monitoringService.calculateCpu(w.trafficBase, replicas);
            double latency = monitoringService.calculateLatency(w.trafficBase, replicas);
            double trend = w.trend;

            totalLatency += latency;

            Optional<ScalingEvent> event = scalingService.applyStrategy(strategy, replicas, cpu, trend, latency);
            if (event.isPresent()) {
                events.add(event.get());
                replicas = event.get().getNewReplicas();
            }
        }

        double avgLatency = totalLatency / wave.size();
        return new ExperimentResult(strategy.getStrategyName(), replicas, avgLatency, events);
    }
}

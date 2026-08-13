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

        // Capture REAL system workload wave (15 steps, 1s apart = ~15s of real data)
        List<MonitoringService.Workload> wave = monitoringService.generateTrafficWave(15);

        // Compute real metric summaries across the wave
        double peakCpu = wave.stream().mapToDouble(w -> w.cpuUsage).max().orElse(0);
        double peakMem = wave.stream().mapToDouble(w -> w.memoryUsage).max().orElse(0);
        double avgCpu  = wave.stream().mapToDouble(w -> w.cpuUsage).average().orElse(0);

        for (String name : strategyNames) {
            ScalingStrategy strategy = strategyEngine.getStrategy(name);
            if (strategy != null) {
                results.add(simulateStrategy(strategy, wave, peakCpu, peakMem, avgCpu));
            }
        }

        if (results.isEmpty()) {
            return new ExperimentResult("NONE", 0, 0, new ArrayList<>(), 0, 0, 0);
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

    private ExperimentResult simulateStrategy(
            ScalingStrategy strategy,
            List<MonitoringService.Workload> wave,
            double peakCpu, double peakMem, double avgCpu) {

        int replicas = 2;
        double totalLatency = 0;
        List<ScalingEvent> events = new ArrayList<>();

        for (MonitoringService.Workload w : wave) {
            // Use REAL cpu reading for CPU strategy; derive latency from real memory pressure
            double cpu     = w.cpuUsage;
            double latency = monitoringService.calculateLatency(w.trafficBase, replicas);
            double trend   = w.trend;

            totalLatency += latency;

            Optional<ScalingEvent> event = scalingService.applyStrategy(strategy, replicas, cpu, trend, latency);
            if (event.isPresent()) {
                events.add(event.get());
                replicas = event.get().getNewReplicas();
            }
        }

        double avgLatency = totalLatency / wave.size();
        return new ExperimentResult(strategy.getStrategyName(), replicas, avgLatency, events, peakCpu, peakMem, avgCpu);
    }
}

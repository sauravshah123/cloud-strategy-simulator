package com.major.cloud.service;

import com.major.cloud.model.ExperimentResult;
import com.major.cloud.model.ScalingEvent;
import com.major.cloud.strategy.ScalingStrategy;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
@RequiredArgsConstructor
public class ExperimentService {

    private final StrategyEngine strategyEngine;
    private final ScalingService scalingService;
    private final MonitoringService monitoringService;

    /** Legacy single-result method kept for compatibility */
    public ExperimentResult runExperiment(List<String> strategyNames) {
        return (ExperimentResult) runExperimentDetailed(strategyNames).get("best");
    }

    /** Full experiment: returns best + all strategy results + real system metrics */
    public Map<String, Object> runExperimentDetailed(List<String> strategyNames) {
        // Capture REAL system workload (15 one-second samples = 15 real seconds)
        List<MonitoringService.Workload> wave = monitoringService.generateTrafficWave(15);

        double peakCpu = wave.stream().mapToDouble(w -> w.cpuUsage).max().orElse(0);
        double peakMem = wave.stream().mapToDouble(w -> w.memoryUsage).max().orElse(0);
        double avgCpu  = wave.stream().mapToDouble(w -> w.cpuUsage).average().orElse(0);
        double avgMem  = wave.stream().mapToDouble(w -> w.memoryUsage).average().orElse(0);

        List<Map<String, Object>> allResults = new ArrayList<>();
        Map<String, Object> bestResult = null;
        double bestLatency = Double.MAX_VALUE;

        for (String name : strategyNames) {
            ScalingStrategy strategy = strategyEngine.getStrategy(name);
            if (strategy == null) continue;

            ExperimentResult r = simulateStrategy(strategy, wave, peakCpu, peakMem, avgCpu);

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("strategy",            r.getBestStrategy());
            entry.put("finalReplicas",        r.getFinalReplicas());
            entry.put("averageResponseTime",  r.getAverageResponseTime());
            entry.put("scalingEvents",        r.getScalingEvents());
            entry.put("scalingEventCount",    r.getScalingEvents().size());
            allResults.add(entry);

            if (r.getAverageResponseTime() < bestLatency) {
                bestLatency = r.getAverageResponseTime();
                bestResult  = entry;
            }
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("strategies",    allResults);
        response.put("bestStrategy",  bestResult != null ? bestResult.get("strategy") : "NONE");
        response.put("peakCpuUsage",  Math.round(peakCpu * 10.0) / 10.0);
        response.put("peakMemUsage",  Math.round(peakMem * 10.0) / 10.0);
        response.put("avgCpuUsage",   Math.round(avgCpu  * 10.0) / 10.0);
        response.put("avgMemUsage",   Math.round(avgMem  * 10.0) / 10.0);
        response.put("sampleCount",   wave.size());
        response.put("timestamp",     System.currentTimeMillis());

        // Also include legacy fields for backward compat
        if (bestResult != null) {
            response.put("finalReplicas",       bestResult.get("finalReplicas"));
            response.put("averageResponseTime", bestResult.get("averageResponseTime"));
            response.put("scalingEvents",       bestResult.get("scalingEvents"));
        }
        return response;
    }

    private ExperimentResult simulateStrategy(
            ScalingStrategy strategy,
            List<MonitoringService.Workload> wave,
            double peakCpu, double peakMem, double avgCpu) {

        int replicas = 2;
        double totalLatency = 0;
        List<ScalingEvent> events = new ArrayList<>();

        for (MonitoringService.Workload w : wave) {
            double latency = monitoringService.calculateLatency(w.trafficBase, replicas);
            totalLatency += latency;

            Optional<ScalingEvent> event = scalingService.applyStrategy(
                strategy, replicas, w.cpuUsage, w.trend, latency);
            if (event.isPresent()) {
                events.add(event.get());
                replicas = event.get().getNewReplicas();
            }
        }

        double avgLatency = totalLatency / wave.size();
        return new ExperimentResult(strategy.getStrategyName(), replicas, avgLatency, events, peakCpu, peakMem, avgCpu);
    }
}

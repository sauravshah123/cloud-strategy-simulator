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

    public ExperimentResult runExperiment(List<String> strategyNames) {
        Map<String, Object> d = runExperimentDetailed(strategyNames);
        @SuppressWarnings("unchecked")
        List<Map<String,Object>> strats = (List<Map<String,Object>>) d.get("strategies");
        if (strats == null || strats.isEmpty())
            return new ExperimentResult("NONE", 0, 0, new ArrayList<>(), 0, 0, 0);
        Map<String,Object> best = strats.get(0);
        @SuppressWarnings("unchecked")
        List<ScalingEvent> evts = (List<ScalingEvent>) best.get("scalingEvents");
        return new ExperimentResult(
            (String) d.get("bestStrategy"),
            (Integer) best.get("finalReplicas"),
            (Double) best.get("averageResponseTime"),
            evts,
            ((Number) d.get("peakCpuUsage")).doubleValue(),
            ((Number) d.get("peakMemUsage")).doubleValue(),
            ((Number) d.get("avgCpuUsage")).doubleValue()
        );
    }

    /** Full experiment — returns timeline data per step for charting */
    public Map<String, Object> runExperimentDetailed(List<String> strategyNames) {
        // Sample real system metrics (10 one-second snapshots)
        List<MonitoringService.Workload> wave = monitoringService.generateTrafficWave(10);

        double peakCpu = wave.stream().mapToDouble(w -> w.cpuUsage).max().orElse(0);
        double peakMem = wave.stream().mapToDouble(w -> w.memoryUsage).max().orElse(0);
        double avgCpu  = wave.stream().mapToDouble(w -> w.cpuUsage).average().orElse(0);
        double avgMem  = wave.stream().mapToDouble(w -> w.memoryUsage).average().orElse(0);

        // Build per-step CPU and memory timeline arrays for the chart
        List<Double> cpuTimeline = new ArrayList<>();
        List<Double> memTimeline = new ArrayList<>();
        for (MonitoringService.Workload w : wave) {
            cpuTimeline.add(Math.round(w.cpuUsage * 10.0) / 10.0);
            memTimeline.add(Math.round(w.memoryUsage * 10.0) / 10.0);
        }

        List<Map<String, Object>> allResults = new ArrayList<>();
        Map<String, Object> bestResult = null;
        double bestLatency = Double.MAX_VALUE;

        for (String name : strategyNames) {
            ScalingStrategy strategy = strategyEngine.getStrategy(name);
            if (strategy == null) continue;

            Map<String, Object> entry = simulateStrategyDetailed(strategy, wave, peakCpu, peakMem, avgCpu);
            allResults.add(entry);

            double lat = (double) entry.get("averageResponseTime");
            if (lat < bestLatency) {
                bestLatency = lat;
                bestResult  = entry;
            }
        }

        // Sort by latency ascending
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
        response.put("cpuTimeline",   cpuTimeline);   // per-step CPU readings
        response.put("memTimeline",   memTimeline);   // per-step memory readings

        // Legacy fields for backward compat
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
            double peakCpu, double peakMem, double avgCpu) {

        int replicas = 2;
        double totalLatency = 0;
        List<ScalingEvent> events = new ArrayList<>();
        List<Integer> replicaTimeline = new ArrayList<>();  // replicas at each step
        List<Double>  latencyTimeline = new ArrayList<>();  // latency at each step

        for (MonitoringService.Workload w : wave) {
            double latency = monitoringService.calculateLatency(w.trafficBase, replicas);
            totalLatency += latency;
            replicaTimeline.add(replicas);
            latencyTimeline.add(Math.round(latency * 10.0) / 10.0);

            Optional<ScalingEvent> event = scalingService.applyStrategy(
                strategy, replicas, w.cpuUsage, w.trend, latency);
            if (event.isPresent()) {
                events.add(event.get());
                replicas = event.get().getNewReplicas();
            }
        }

        double avgLatency = totalLatency / wave.size();

        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("strategy",           strategy.getStrategyName());
        entry.put("finalReplicas",       replicas);
        entry.put("averageResponseTime", Math.round(avgLatency * 10.0) / 10.0);
        entry.put("scalingEvents",       events);
        entry.put("scalingEventCount",   events.size());
        entry.put("replicaTimeline",     replicaTimeline);  // NEW: per-step replica counts
        entry.put("latencyTimeline",     latencyTimeline);  // NEW: per-step latency values
        return entry;
    }
}

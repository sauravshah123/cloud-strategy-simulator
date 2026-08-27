package com.major.cloud.service;

import org.springframework.stereotype.Service;
import java.util.*;

/**
 * Estimates cloud cost per scaling strategy based on replica count and time.
 * Pricing model: t3.small equivalent = $0.023/hour per replica (AWS on-demand).
 */
@Service
public class CostCalculationService {

    private static final double COST_PER_REPLICA_HOUR = 0.023; // USD — t3.small on-demand
    private static final double COST_STORAGE_HOUR     = 0.002; // EBS gp3 per replica
    private static final double COST_NETWORK_HOUR     = 0.001; // egress estimate per replica

    public record CostReport(
            String strategy,
            int    avgReplicas,
            int    peakReplicas,
            double costPerHour,
            double estimatedRunCostUsd,
            double savingsVsWorstUsd,
            double efficiencyScore,    // 0-100, higher = more cost-efficient
            String recommendation
    ) {}

    /**
     * Builds a cost report for one strategy based on its replica timeline.
     * @param strategy   strategy name
     * @param replicaTimeline per-step replica counts
     * @param durationSeconds total experiment duration
     */
    public CostReport calculateCost(String strategy, List<Integer> replicaTimeline, int durationSeconds) {
        if (replicaTimeline == null || replicaTimeline.isEmpty()) {
            return new CostReport(strategy, 0, 0, 0, 0, 0, 0, "No data");
        }

        double avgReplicas  = replicaTimeline.stream().mapToInt(i -> i).average().orElse(0);
        int    peakReplicas = replicaTimeline.stream().mapToInt(i -> i).max().orElse(0);

        double hourFraction = durationSeconds / 3600.0;
        double costPerHour  = avgReplicas * (COST_PER_REPLICA_HOUR + COST_STORAGE_HOUR + COST_NETWORK_HOUR);
        double runCost      = costPerHour * hourFraction;

        return new CostReport(
                strategy,
                (int) Math.round(avgReplicas),
                peakReplicas,
                Math.round(costPerHour * 1000.0) / 1000.0,
                Math.round(runCost    * 100000.0) / 100000.0,
                0, // filled in after comparing all strategies
                0, // filled in after comparing
                ""
        );
    }

    /**
     * Computes cost for all strategies, adds savings vs worst and efficiency scores.
     */
    public List<Map<String, Object>> compareStrategyCosts(
            List<Map<String, Object>> strategyResults, int durationSeconds) {

        List<CostReport> reports = new ArrayList<>();
        for (Map<String, Object> s : strategyResults) {
            String strategy = (String) s.get("strategy");
            @SuppressWarnings("unchecked")
            List<Integer> timeline = (List<Integer>) s.getOrDefault("replicaTimeline", List.of(2));
            reports.add(calculateCost(strategy, timeline, durationSeconds));
        }

        double maxCost = reports.stream().mapToDouble(CostReport::costPerHour).max().orElse(1);
        double minCost = reports.stream().mapToDouble(CostReport::costPerHour).min().orElse(0);

        List<Map<String, Object>> result = new ArrayList<>();
        for (CostReport r : reports) {
            double savings    = maxCost > 0 ? (maxCost - r.costPerHour()) : 0;
            double efficiency = maxCost > 0 ? ((maxCost - r.costPerHour()) / maxCost) * 100 : 100;
            String rec = efficiency > 60 ? "✅ Most Cost-Efficient"
                       : efficiency > 30 ? "⚠️ Moderate Cost"
                       :                   "❌ Highest Cost";

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("strategy",            r.strategy());
            m.put("avgReplicas",         r.avgReplicas());
            m.put("peakReplicas",        r.peakReplicas());
            m.put("costPerHourUsd",      r.costPerHour());
            m.put("estimatedRunCostUsd", r.estimatedRunCostUsd());
            m.put("savingsVsWorstUsd",   Math.round(savings * 1000.0) / 1000.0);
            m.put("efficiencyScore",     Math.round(efficiency * 10.0) / 10.0);
            m.put("recommendation",      rec);
            result.add(m);
        }

        // Sort best-to-worst by cost
        result.sort(Comparator.comparingDouble(m -> (double) m.get("costPerHourUsd")));
        return result;
    }

    public Map<String, Object> monthlyProjection(double costPerHour) {
        Map<String, Object> proj = new LinkedHashMap<>();
        proj.put("hourly",  Math.round(costPerHour * 100.0) / 100.0);
        proj.put("daily",   Math.round(costPerHour * 24 * 100.0) / 100.0);
        proj.put("weekly",  Math.round(costPerHour * 168 * 100.0) / 100.0);
        proj.put("monthly", Math.round(costPerHour * 730 * 100.0) / 100.0);
        proj.put("yearly",  Math.round(costPerHour * 8760 * 100.0) / 100.0);
        return proj;
    }
}

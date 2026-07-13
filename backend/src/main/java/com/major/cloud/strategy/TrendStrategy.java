package com.major.cloud.strategy;

import org.springframework.stereotype.Component;

@Component
public class TrendStrategy implements ScalingStrategy {
    @Override
    public int calculateReplicas(int currentReplicas, double trafficTrend) {
        // Assume trafficTrend is a metric representing growth rate (e.g. >1.5 means growing 50%)
        if (trafficTrend > 1.2) {
            return currentReplicas + 1; // gradual scale up
        } else if (trafficTrend < 0.8 && currentReplicas > 1) {
            return currentReplicas - 1;
        }
        return currentReplicas;
    }

    @Override
    public String getStrategyName() {
        return "TREND";
    }
}

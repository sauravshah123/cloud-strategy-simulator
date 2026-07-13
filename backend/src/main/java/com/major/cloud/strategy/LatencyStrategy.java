package com.major.cloud.strategy;

import org.springframework.stereotype.Component;

@Component
public class LatencyStrategy implements ScalingStrategy {
    @Override
    public int calculateReplicas(int currentReplicas, double latencyMs) {
        if (latencyMs > 500.0) {
            return currentReplicas + 3; // aggressive scaling
        } else if (latencyMs < 200.0 && currentReplicas > 1) {
            return currentReplicas - 1;
        }
        return currentReplicas;
    }

    @Override
    public String getStrategyName() {
        return "LATENCY";
    }
}

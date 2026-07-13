package com.major.cloud.strategy;

import org.springframework.stereotype.Component;

@Component
public class CpuStrategy implements ScalingStrategy {
    @Override
    public int calculateReplicas(int currentReplicas, double cpuUsage) {
        if (cpuUsage > 75.0) {
            return currentReplicas + 2;
        } else if (cpuUsage < 30.0 && currentReplicas > 1) {
            return currentReplicas - 1;
        }
        return currentReplicas;
    }

    @Override
    public String getStrategyName() {
        return "CPU";
    }
}

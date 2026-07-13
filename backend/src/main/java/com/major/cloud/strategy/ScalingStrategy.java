package com.major.cloud.strategy;

public interface ScalingStrategy {
    int calculateReplicas(int currentReplicas, double metricValue);
    String getStrategyName();
}

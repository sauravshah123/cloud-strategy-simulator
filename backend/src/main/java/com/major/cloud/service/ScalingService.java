package com.major.cloud.service;

import com.major.cloud.model.ScalingEvent;
import com.major.cloud.strategy.ScalingStrategy;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class ScalingService {

    public Optional<ScalingEvent> applyStrategy(ScalingStrategy strategy, int currentReplicas, double cpu, double trend, double latency) {
        double metricValue = 0;
        
        switch (strategy.getStrategyName()) {
            case "CPU":
                metricValue = cpu;
                break;
            case "TREND":
                metricValue = trend;
                break;
            case "LATENCY":
                metricValue = latency;
                break;
        }

        int newReplicas = strategy.calculateReplicas(currentReplicas, metricValue);

        if (newReplicas != currentReplicas) {
            String reason = String.format("Metric threshold crossed: %.2f", metricValue);
            ScalingEvent event = new ScalingEvent(
                    strategy.getStrategyName(),
                    currentReplicas,
                    newReplicas,
                    reason,
                    LocalDateTime.now()
            );
            return Optional.of(event);
        }
        return Optional.empty();
    }
}

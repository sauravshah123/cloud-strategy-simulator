package com.major.cloud.strategy;

import com.major.cloud.service.StrategyConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Scales replicas based on response latency (milliseconds).
 * Thresholds are read from StrategyConfigService at call-time
 * so runtime updates are honoured immediately.
 */
@Component
@RequiredArgsConstructor
public class LatencyStrategy implements ScalingStrategy {

    private final StrategyConfigService configService;

    @Override
    public int calculateReplicas(int currentReplicas, double latencyMs) {
        StrategyConfigService.StrategyConfig cfg = configService.get("LATENCY");
        if (cfg == null) {
            return latencyMs > 500.0
                    ? currentReplicas + 3
                    : (latencyMs < 200.0 && currentReplicas > 1 ? currentReplicas - 1 : currentReplicas);
        }

        int newReplicas = currentReplicas;
        if (latencyMs > cfg.getScaleUpThreshold()) {
            newReplicas = currentReplicas + cfg.getScaleUpStep();
        } else if (latencyMs < cfg.getScaleDownThreshold() && currentReplicas > cfg.getMinReplicas()) {
            newReplicas = currentReplicas - cfg.getScaleDownStep();
        }
        return Math.max(cfg.getMinReplicas(), Math.min(cfg.getMaxReplicas(), newReplicas));
    }

    @Override
    public String getStrategyName() { return "LATENCY"; }
}

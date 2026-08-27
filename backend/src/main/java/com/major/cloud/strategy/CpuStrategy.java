package com.major.cloud.strategy;

import com.major.cloud.service.StrategyConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Scales replicas based on CPU utilisation percentage.
 * Thresholds are read from StrategyConfigService at call-time,
 * so runtime updates (PUT /api/config/CPU) take effect immediately.
 */
@Component
@RequiredArgsConstructor
public class CpuStrategy implements ScalingStrategy {

    private final StrategyConfigService configService;

    @Override
    public int calculateReplicas(int currentReplicas, double cpuUsage) {
        StrategyConfigService.StrategyConfig cfg = configService.get("CPU");
        if (cfg == null) {
            // Fallback defaults if config not yet initialised
            return cpuUsage > 75.0
                    ? currentReplicas + 2
                    : (cpuUsage < 30.0 && currentReplicas > 1 ? currentReplicas - 1 : currentReplicas);
        }

        int newReplicas = currentReplicas;
        if (cpuUsage > cfg.getScaleUpThreshold()) {
            newReplicas = currentReplicas + cfg.getScaleUpStep();
        } else if (cpuUsage < cfg.getScaleDownThreshold() && currentReplicas > cfg.getMinReplicas()) {
            newReplicas = currentReplicas - cfg.getScaleDownStep();
        }
        return Math.max(cfg.getMinReplicas(), Math.min(cfg.getMaxReplicas(), newReplicas));
    }

    @Override
    public String getStrategyName() { return "CPU"; }
}

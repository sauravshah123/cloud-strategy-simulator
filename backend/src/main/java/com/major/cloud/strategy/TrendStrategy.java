package com.major.cloud.strategy;

import com.major.cloud.service.StrategyConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Proactive scaling based on CPU growth rate (trend ratio).
 * trend > 1.2 means CPU is growing 20 % faster than the previous sample — scale up early.
 * Thresholds driven by StrategyConfigService for runtime tunability.
 */
@Component
@RequiredArgsConstructor
public class TrendStrategy implements ScalingStrategy {

    private final StrategyConfigService configService;

    @Override
    public int calculateReplicas(int currentReplicas, double trafficTrend) {
        StrategyConfigService.StrategyConfig cfg = configService.get("TREND");
        if (cfg == null) {
            return trafficTrend > 1.2
                    ? currentReplicas + 1
                    : (trafficTrend < 0.8 && currentReplicas > 1 ? currentReplicas - 1 : currentReplicas);
        }

        int newReplicas = currentReplicas;
        if (trafficTrend > cfg.getScaleUpThreshold()) {
            newReplicas = currentReplicas + cfg.getScaleUpStep();
        } else if (trafficTrend < cfg.getScaleDownThreshold() && currentReplicas > cfg.getMinReplicas()) {
            newReplicas = currentReplicas - cfg.getScaleDownStep();
        }
        return Math.max(cfg.getMinReplicas(), Math.min(cfg.getMaxReplicas(), newReplicas));
    }

    @Override
    public String getStrategyName() { return "TREND"; }
}

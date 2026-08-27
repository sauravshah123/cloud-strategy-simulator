package com.major.cloud.service;

import lombok.Getter;
import lombok.Setter;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Allows users to tune the thresholds for each scaling strategy at runtime.
 */
@Service
public class StrategyConfigService {

    @Getter @Setter
    public static class StrategyConfig {
        private String strategy;
        private double scaleUpThreshold;    // CPU % or latency ms that triggers scale-up
        private double scaleDownThreshold;  // value below which we scale down
        private int    scaleUpStep;         // how many replicas to add at once
        private int    scaleDownStep;       // how many replicas to remove
        private int    minReplicas;
        private int    maxReplicas;
        private String description;
    }

    private final Map<String, StrategyConfig> configs = new ConcurrentHashMap<>();

    public StrategyConfigService() {
        // Defaults matching current strategy implementations
        configs.put("CPU", config("CPU",
                75, 30, 1, 1, 1, 20,
                "Scales based on real CPU load. Adds 1 replica when CPU > scaleUpThreshold."));
        configs.put("TREND", config("TREND",
                1.2, 0.8, 1, 1, 1, 20,
                "Scales based on CPU growth rate (trend ratio). Proactively adds capacity before overload."));
        configs.put("LATENCY", config("LATENCY",
                500, 200, 3, 1, 1, 20,
                "Aggressively scales when response time exceeds threshold. Adds 3 replicas on latency spike."));
    }

    public Map<String, StrategyConfig> getAll() {
        return Collections.unmodifiableMap(configs);
    }

    public StrategyConfig get(String strategy) {
        return configs.get(strategy.toUpperCase());
    }

    public StrategyConfig update(String strategy, StrategyConfig newConfig) {
        newConfig.setStrategy(strategy.toUpperCase());
        // Validate ranges
        if (newConfig.getMinReplicas() < 1) newConfig.setMinReplicas(1);
        if (newConfig.getMaxReplicas() > 50) newConfig.setMaxReplicas(50);
        if (newConfig.getMinReplicas() > newConfig.getMaxReplicas())
            newConfig.setMinReplicas(newConfig.getMaxReplicas());
        configs.put(strategy.toUpperCase(), newConfig);
        return newConfig;
    }

    public StrategyConfig reset(String strategy) {
        StrategyConfigService fresh = new StrategyConfigService();
        StrategyConfig def = fresh.get(strategy);
        configs.put(strategy.toUpperCase(), def);
        return def;
    }

    private static StrategyConfig config(String name, double up, double down,
                                          int upStep, int downStep, int min, int max, String desc) {
        StrategyConfig c = new StrategyConfig();
        c.setStrategy(name);
        c.setScaleUpThreshold(up);
        c.setScaleDownThreshold(down);
        c.setScaleUpStep(upStep);
        c.setScaleDownStep(downStep);
        c.setMinReplicas(min);
        c.setMaxReplicas(max);
        c.setDescription(desc);
        return c;
    }
}

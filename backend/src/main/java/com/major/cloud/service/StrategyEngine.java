package com.major.cloud.service;

import com.major.cloud.strategy.ScalingStrategy;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class StrategyEngine {
    private final Map<String, ScalingStrategy> strategies;

    public StrategyEngine(List<ScalingStrategy> strategyList) {
        this.strategies = strategyList.stream()
                .collect(Collectors.toMap(ScalingStrategy::getStrategyName, s -> s));
    }

    public ScalingStrategy getStrategy(String name) {
        return strategies.get(name.toUpperCase());
    }
}

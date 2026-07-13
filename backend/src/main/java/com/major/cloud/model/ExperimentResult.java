package com.major.cloud.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ExperimentResult {
    private String bestStrategy;
    private int finalReplicas;
    private double averageResponseTime;
    private List<ScalingEvent> scalingEvents;
}

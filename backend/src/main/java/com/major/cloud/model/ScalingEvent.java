package com.major.cloud.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ScalingEvent {
    private String strategyName;
    private int oldReplicas;
    private int newReplicas;
    private String reason;
    private LocalDateTime timestamp;
}

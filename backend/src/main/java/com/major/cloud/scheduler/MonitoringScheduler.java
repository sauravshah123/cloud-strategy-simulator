package com.major.cloud.scheduler;

import com.major.cloud.service.MonitoringService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class MonitoringScheduler {

    private final MonitoringService monitoringService;
    private int currentReplicas = 2; // Demo purposes

    @Scheduled(fixedRate = 5000)
    public void monitorMetrics() {
        double trafficBase = 500.0; // hardcoded demo value
        double cpu = monitoringService.calculateCpu(trafficBase, currentReplicas);
        double latency = monitoringService.calculateLatency(trafficBase, currentReplicas);
        
        log.info(String.format("Monitoring Event - CPU: %.2f%%, Latency: %.2fms, Replicas: %d", cpu, latency, currentReplicas));
    }
}

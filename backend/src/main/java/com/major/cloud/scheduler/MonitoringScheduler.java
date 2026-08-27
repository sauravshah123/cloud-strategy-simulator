package com.major.cloud.scheduler;

import com.major.cloud.service.MonitoringService;
import com.major.cloud.service.AlertService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Background health monitor.
 * Samples real OSHI CPU/memory every 5 s and feeds them into the AlertService
 * so alerts fire even outside an active experiment.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class MonitoringScheduler {

    private final MonitoringService monitoringService;
    private final AlertService      alertService;

    @Scheduled(fixedRate = 5000)
    public void monitorHealth() {
        try {
            double cpu    = monitoringService.getRealCpuUsage();
            double memory = monitoringService.getRealMemoryUsage();
            alertService.evaluate(cpu, memory);
            log.debug("Health tick — CPU: {:.1f}%, MEM: {:.1f}%", cpu, memory);
        } catch (Exception e) {
            log.warn("MonitoringScheduler tick failed: {}", e.getMessage());
        }
    }
}

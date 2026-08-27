package com.major.cloud.controller;

import com.major.cloud.service.AlertService;
import com.major.cloud.service.AuditLogService;
import com.major.cloud.service.SlaTrackerService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.management.*;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Exposes rich system health and statistics beyond the basic actuator/health.
 * Used by the frontend Dashboard page for at-a-glance platform status.
 */
@RestController
@RequestMapping("/api/system")
@RequiredArgsConstructor
public class SystemInfoController {

    private final SlaTrackerService slaTrackerService;
    private final AlertService      alertService;
    private final AuditLogService   auditLogService;

    @GetMapping("/info")
    public ResponseEntity<Map<String, Object>> info() {
        Runtime rt = Runtime.getRuntime();
        OperatingSystemMXBean os = ManagementFactory.getOperatingSystemMXBean();
        MemoryMXBean mem = ManagementFactory.getMemoryMXBean();
        ThreadMXBean threads = ManagementFactory.getThreadMXBean();
        RuntimeMXBean runtimeMXBean = ManagementFactory.getRuntimeMXBean();

        long heapUsed  = mem.getHeapMemoryUsage().getUsed();
        long heapMax   = mem.getHeapMemoryUsage().getMax();
        long uptimeMs  = runtimeMXBean.getUptime();

        Map<String, Object> jvm = new LinkedHashMap<>();
        jvm.put("heapUsedMb",    heapUsed  / (1024 * 1024));
        jvm.put("heapMaxMb",     heapMax   / (1024 * 1024));
        jvm.put("heapUsagePct",  heapMax > 0 ? Math.round((heapUsed * 100.0 / heapMax) * 10) / 10.0 : 0);
        jvm.put("threadCount",   threads.getThreadCount());
        jvm.put("peakThreads",   threads.getPeakThreadCount());
        jvm.put("uptimeMs",      uptimeMs);
        jvm.put("uptimeMin",     uptimeMs / 60_000);
        jvm.put("javaVersion",   System.getProperty("java.version"));
        jvm.put("processors",    rt.availableProcessors());

        Map<String, Object> platform = new LinkedHashMap<>();
        platform.put("os",        os.getName() + " " + os.getArch());
        platform.put("cpuCores",  os.getAvailableProcessors());
        platform.put("appVersion", "2.0.0-enterprise");
        platform.put("buildTime",  "2026-08-27");

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalAlerts",   alertService.getAlerts(false).size());
        stats.put("pendingAlerts", alertService.getAlerts(true).size());
        stats.put("auditEntries",  auditLogService.getStats().get("totalEntries"));
        stats.put("slaGlobal",     slaTrackerService.getGlobalStats());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status",   "UP");
        body.put("jvm",      jvm);
        body.put("platform", platform);
        body.put("appStats", stats);
        body.put("timestamp", System.currentTimeMillis());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/ping")
    public ResponseEntity<Map<String, Object>> ping() {
        return ResponseEntity.ok(Map.of(
            "status",    "pong",
            "timestamp", System.currentTimeMillis(),
            "version",   "2.0.0-enterprise"
        ));
    }
}

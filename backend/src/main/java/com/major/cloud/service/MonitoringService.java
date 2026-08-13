package com.major.cloud.service;

import oshi.SystemInfo;
import oshi.hardware.CentralProcessor;
import oshi.hardware.GlobalMemory;
import oshi.hardware.HardwareAbstractionLayer;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class MonitoringService {

    private final SystemInfo systemInfo = new SystemInfo();
    private final HardwareAbstractionLayer hardware = systemInfo.getHardware();
    private final CentralProcessor processor = hardware.getProcessor();
    private final GlobalMemory memory = hardware.getMemory();

    // Holds previous CPU ticks for accurate delta-based reading
    private long[] prevTicks = processor.getSystemCpuLoadTicks();

    public static class Workload {
        public double cpuUsage;       // Real CPU % from host
        public double memoryUsage;    // Real memory % from host
        public double trafficBase;    // Derived from memory pressure
        public double trend;          // Rate of change between steps
    }

    /**
     * Captures real system metrics over 'steps' intervals (1s apart each).
     * CPU, Memory are read directly from the OS.
     */
    public List<Workload> generateTrafficWave(int steps) {
        List<Workload> wave = new ArrayList<>();
        double prevCpu = getRealCpuUsage();

        for (int i = 0; i < steps; i++) {
            // Wait 1 second between samples for accurate CPU delta
            try { Thread.sleep(1000); } catch (InterruptedException ignored) {}

            double cpu  = getRealCpuUsage();
            double mem  = getRealMemoryUsage();

            Workload w = new Workload();
            w.cpuUsage    = cpu;
            w.memoryUsage = mem;
            // Derive synthetic traffic from memory pressure (scaled to 100-500)
            w.trafficBase = 100 + (mem / 100.0) * 400;
            // Trend = ratio of current CPU to previous CPU (growth/decline rate)
            w.trend = (prevCpu > 0) ? (cpu / prevCpu) : 1.0;
            wave.add(w);

            prevCpu = cpu;
        }
        return wave;
    }

    /** Returns real CPU usage (0-100) using OSHI tick-based reading */
    public double getRealCpuUsage() {
        double load = processor.getSystemCpuLoadBetweenTicks(prevTicks) * 100.0;
        prevTicks = processor.getSystemCpuLoadTicks();
        return Math.max(0, Math.min(100, load));
    }

    /** Returns real memory usage percentage (0-100) */
    public double getRealMemoryUsage() {
        long total = memory.getTotal();
        long available = memory.getAvailable();
        long used = total - available;
        return (total > 0) ? ((double) used / total) * 100.0 : 0;
    }

    /** CPU contribution to latency — higher CPU = worse response time */
    public double calculateCpu(double trafficBase, int replicas) {
        double cpu = (trafficBase / replicas) * 0.8;
        return Math.min(100.0, cpu);
    }

    /** Latency model — real traffic base scaled by replicas */
    public double calculateLatency(double trafficBase, int replicas) {
        return (trafficBase / replicas) * 2.5;
    }
}

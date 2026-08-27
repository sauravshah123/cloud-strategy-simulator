package com.major.cloud.service;

import lombok.Getter;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Tracks SLA (Service Level Agreement) metrics per strategy.
 * Uptime = time replica count >= minReplicas / total time.
 * MTTR  = avg time (ms) to heal from a crash.
 * MTBF  = avg time (ms) between crashes.
 */
@Service
public class SlaTrackerService {

    @Getter
    public static class SlaRecord {
        private final String    strategy;
        private       int       totalTicks;         // number of samples
        private       int       healthyTicks;        // samples where replicas >= 1
        private       long      totalCrashes;
        private       long      totalHealMs;
        private       LocalDateTime windowStart;
        private final List<Map<String, Object>> events = new CopyOnWriteArrayList<>();

        public SlaRecord(String strategy) {
            this.strategy    = strategy;
            this.windowStart = LocalDateTime.now();
        }

        public void recordTick(int replicas) {
            totalTicks++;
            if (replicas >= 1) healthyTicks++;
        }

        public void recordCrash(long healDurationMs) {
            totalCrashes++;
            totalHealMs += healDurationMs;
            events.add(Map.of(
                "type",         "CRASH",
                "timestamp",    LocalDateTime.now().toString(),
                "healDurationMs", healDurationMs
            ));
        }

        public double getUptimePct() {
            return totalTicks == 0 ? 100.0 : Math.round((healthyTicks * 100.0 / totalTicks) * 100.0) / 100.0;
        }

        public double getMttrMs() {
            return totalCrashes == 0 ? 0 : Math.round((totalHealMs / (double) totalCrashes) * 10.0) / 10.0;
        }

        public String getSlaGrade() {
            double up = getUptimePct();
            if (up >= 99.9) return "AAA — 99.9%+";
            if (up >= 99.5) return "AA  — 99.5%+";
            if (up >= 99.0) return "A   — 99.0%+";
            if (up >= 95.0) return "B   — 95.0%+";
            return                 "C   — Below 95%";
        }
    }

    private final Map<String, SlaRecord> records = new LinkedHashMap<>();
    private final AtomicLong globalTicks  = new AtomicLong(0);
    private final LocalDateTime sessionStart = LocalDateTime.now();

    public SlaTrackerService() {
        for (String s : List.of("CPU", "TREND", "LATENCY")) {
            records.put(s, new SlaRecord(s));
        }
    }

    public void recordTick(String strategy, int replicas) {
        globalTicks.incrementAndGet();
        SlaRecord r = records.computeIfAbsent(strategy, SlaRecord::new);
        r.recordTick(replicas);
    }

    public void recordHeal(String strategy, long healDurationMs) {
        records.computeIfAbsent(strategy, SlaRecord::new).recordCrash(healDurationMs);
    }

    public Map<String, Object> getSummary(String strategy) {
        SlaRecord r = records.getOrDefault(strategy, new SlaRecord(strategy));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("strategy",       r.getStrategy());
        m.put("uptimePct",      r.getUptimePct());
        m.put("slaGrade",       r.getSlaGrade());
        m.put("totalCrashes",   r.getTotalCrashes());
        m.put("mttrMs",         r.getMttrMs());
        m.put("totalTicks",     r.getTotalTicks());
        m.put("healthyTicks",   r.getHealthyTicks());
        m.put("windowStart",    r.getWindowStart().toString());
        return m;
    }

    public List<Map<String, Object>> getAllSummaries() {
        return records.values().stream().map(r -> getSummary(r.getStrategy())).toList();
    }

    public Map<String, Object> getGlobalStats() {
        double avgUptime = records.values().stream()
                .mapToDouble(SlaRecord::getUptimePct).average().orElse(100.0);
        long totalCrashes = records.values().stream()
                .mapToLong(SlaRecord::getTotalCrashes).sum();
        return Map.of(
                "sessionStart",    sessionStart.toString(),
                "avgUptimePct",    Math.round(avgUptime * 100.0) / 100.0,
                "totalCrashes",    totalCrashes,
                "globalTicks",     globalTicks.get()
        );
    }

    public void reset() {
        records.clear();
        for (String s : List.of("CPU", "TREND", "LATENCY")) records.put(s, new SlaRecord(s));
        globalTicks.set(0);
    }
}

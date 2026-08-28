package com.major.cloud.config;

import com.major.cloud.service.ExperimentService;
import com.major.cloud.service.AuditLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import com.major.cloud.repository.ExperimentRunRepository;

import java.util.List;
import java.util.Map;

/**
 * Seeds 2 demo experiment runs on startup so the dashboard is never empty.
 * Skips seeding if history already exists (idempotent).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DemoDataSeeder {

    private final ExperimentService       experimentService;
    private final AuditLogService         auditLogService;
    private final ExperimentRunRepository experimentRunRepository;

    @Async
    @EventListener(ApplicationReadyEvent.class)
    public void seedDemoData() {
        try {
            // Wait for app to fully stabilise
            Thread.sleep(6000);

            // Skip if data already exists
            if (experimentRunRepository.count() > 0) {
                log.info("Demo seeder: history already present ({} runs) — skipping.", experimentRunRepository.count());
                return;
            }

            log.info("🌱 Demo seeder: running 2 seed experiments to populate dashboard...");

            // Seed run 1 — no docker (fast simulation)
            Map<String, Object> r1 = experimentService.runExperimentDetailed(
                    List.of("CPU", "TREND", "LATENCY"), null);
            log.info("🌱 Seed run 1 complete — winner: {}", r1.get("bestStrategy"));

            Thread.sleep(2000);

            // Seed run 2 — second simulation for history variety
            Map<String, Object> r2 = experimentService.runExperimentDetailed(
                    List.of("CPU", "TREND", "LATENCY"), null);
            log.info("🌱 Seed run 2 complete — winner: {}", r2.get("bestStrategy"));

            auditLogService.system(AuditLogService.ActionType.EXPERIMENT_COMPLETED,
                    "DEMO_SEEDER", "Seeded 2 demo experiments for dashboard population");

            log.info("✅ Demo seeder complete — dashboard now has history data.");
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.warn("Demo seeder failed (non-fatal): {}", e.getMessage());
        }
    }
}

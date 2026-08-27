package com.major.cloud.controller;

import com.major.cloud.service.AuditLogService;
import com.major.cloud.service.SlaTrackerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/sla")
@RequiredArgsConstructor
@Tag(name = "SLA", description = "Service Level Agreement metrics — uptime, MTTR, SLA grade per strategy")
public class SlaController {

    private final SlaTrackerService slaTrackerService;
    private final AuditLogService   auditLogService;

    @GetMapping
    @Operation(summary = "Get all SLA summaries")
    public ResponseEntity<?> getAll() {
        return ResponseEntity.ok(slaTrackerService.getAllSummaries());
    }

    @GetMapping("/global")
    @Operation(summary = "Global session SLA stats")
    public ResponseEntity<?> global() {
        return ResponseEntity.ok(slaTrackerService.getGlobalStats());
    }

    @GetMapping("/{strategy}")
    @Operation(summary = "Get SLA for one strategy")
    public ResponseEntity<?> get(@PathVariable String strategy) {
        return ResponseEntity.ok(slaTrackerService.getSummary(strategy.toUpperCase()));
    }

    @PostMapping("/reset")
    @Operation(summary = "Reset all SLA counters")
    public ResponseEntity<?> reset() {
        slaTrackerService.reset();
        auditLogService.user(AuditLogService.ActionType.CONFIG_CHANGED, "SLA", "SLA counters reset by user");
        return ResponseEntity.ok(Map.of("status", "RESET"));
    }
}

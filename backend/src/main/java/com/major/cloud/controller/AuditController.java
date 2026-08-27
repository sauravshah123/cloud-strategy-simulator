package com.major.cloud.controller;

import com.major.cloud.service.AuditLogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/audit")
@RequiredArgsConstructor
@Tag(name = "Audit Log", description = "Immutable audit trail of all system and user actions")
public class AuditController {

    private final AuditLogService auditLogService;

    @GetMapping
    @Operation(summary = "Get all audit entries (newest first)")
    public ResponseEntity<?> getAll() {
        return ResponseEntity.ok(auditLogService.getAll());
    }

    @GetMapping("/stats")
    @Operation(summary = "Audit log statistics")
    public ResponseEntity<?> stats() {
        return ResponseEntity.ok(auditLogService.getStats());
    }

    @GetMapping("/filter")
    @Operation(summary = "Filter audit log by action type")
    public ResponseEntity<?> filter(@RequestParam String action) {
        return ResponseEntity.ok(auditLogService.getByAction(action));
    }
}

package com.major.cloud.controller;

import com.major.cloud.service.AlertService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

@RestController
@RequestMapping("/api/alerts")
@RequiredArgsConstructor
@Tag(name = "Alerts", description = "Configurable threshold alerts with real-time SSE delivery")
public class AlertController {

    private final AlertService alertService;

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "SSE stream of alerts")
    public SseEmitter stream() { return alertService.subscribe(); }

    @GetMapping("/rules")
    @Operation(summary = "List all alert rules")
    public ResponseEntity<?> getRules() {
        return ResponseEntity.ok(alertService.getRules());
    }

    @PostMapping("/rules")
    @Operation(summary = "Create a new alert rule")
    public ResponseEntity<?> addRule(@RequestBody AlertService.AlertRule rule) {
        return ResponseEntity.ok(alertService.addRule(rule));
    }

    @DeleteMapping("/rules/{id}")
    @Operation(summary = "Delete an alert rule")
    public ResponseEntity<?> deleteRule(@PathVariable String id) {
        boolean deleted = alertService.deleteRule(id);
        return deleted ? ResponseEntity.ok(Map.of("status", "DELETED"))
                       : ResponseEntity.notFound().build();
    }

    @GetMapping
    @Operation(summary = "Get fired alerts")
    public ResponseEntity<?> getAlerts(@RequestParam(defaultValue = "false") boolean unacknowledgedOnly) {
        return ResponseEntity.ok(alertService.getAlerts(unacknowledgedOnly));
    }

    @PostMapping("/{id}/acknowledge")
    @Operation(summary = "Acknowledge an alert")
    public ResponseEntity<?> acknowledge(@PathVariable String id) {
        boolean ok = alertService.acknowledgeAlert(id);
        return ok ? ResponseEntity.ok(Map.of("status", "ACKNOWLEDGED"))
                  : ResponseEntity.notFound().build();
    }

    @DeleteMapping
    @Operation(summary = "Clear all alerts")
    public ResponseEntity<?> clearAlerts() {
        alertService.clearAlerts();
        return ResponseEntity.ok(Map.of("status", "CLEARED"));
    }
}

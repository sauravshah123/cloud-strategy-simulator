package com.major.cloud.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.major.cloud.service.MonitoringService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.*;

@RestController
@RequestMapping("/api/metrics")
@RequiredArgsConstructor
public class MetricsStreamController {

    private final MonitoringService monitoringService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Thread-safe set of active SSE clients
    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    // Background scheduler that pushes to all connected clients
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    {
        // Start broadcasting real metrics every 2 seconds
        scheduler.scheduleAtFixedRate(() -> {
            double cpu = monitoringService.getRealCpuUsage();
            double mem = monitoringService.getRealMemoryUsage();
            Map<String, Object> payload = Map.of(
                "timestamp",   Instant.now().toEpochMilli(),
                "cpuUsage",    Math.round(cpu * 10.0) / 10.0,
                "memoryUsage", Math.round(mem * 10.0) / 10.0,
                "status",      cpu > 80 ? "HIGH" : cpu > 50 ? "MEDIUM" : "LOW"
            );
            broadcast(payload);
        }, 0, 2, TimeUnit.SECONDS);
    }

    /** SSE stream endpoint — frontend connects once and receives real-time pushes */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));
        return emitter;
    }

    /** One-shot REST endpoint for quick polling fallback */
    @GetMapping
    public Map<String, Object> getSnapshot() {
        double cpu = monitoringService.getRealCpuUsage();
        double mem = monitoringService.getRealMemoryUsage();
        return Map.of(
            "timestamp",   Instant.now().toEpochMilli(),
            "cpuUsage",    Math.round(cpu * 10.0) / 10.0,
            "memoryUsage", Math.round(mem * 10.0) / 10.0,
            "status",      cpu > 80 ? "HIGH" : cpu > 50 ? "MEDIUM" : "LOW"
        );
    }

    private void broadcast(Object payload) {
        String json;
        try { json = objectMapper.writeValueAsString(payload); }
        catch (Exception e) { return; }

        emitters.removeIf(emitter -> {
            try {
                emitter.send(SseEmitter.event().data(json));
                return false;
            } catch (IOException ex) {
                return true; // remove dead emitters
            }
        });
    }
}

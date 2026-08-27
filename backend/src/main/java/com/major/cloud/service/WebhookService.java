package com.major.cloud.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

/**
 * Sends JSON POST notifications to registered webhook URLs
 * whenever a healing event, alert, or experiment completes.
 * All deliveries are async and fire-and-forget.
 */
@Slf4j
@Service
public class WebhookService {

    private final List<String>  registeredUrls = new CopyOnWriteArrayList<>();
    private final ExecutorService pool          = Executors.newFixedThreadPool(4);
    private final HttpClient      http          = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    // ── Registration ──────────────────────────────────────────────────────────

    public String register(String url) {
        if (!url.startsWith("http")) throw new IllegalArgumentException("Invalid webhook URL: " + url);
        if (!registeredUrls.contains(url)) registeredUrls.add(url);
        log.info("Webhook registered: {}", url);
        return url;
    }

    public boolean unregister(String url) {
        return registeredUrls.remove(url);
    }

    public List<String> getRegistered() { return Collections.unmodifiableList(registeredUrls); }

    // ── Delivery ──────────────────────────────────────────────────────────────

    public void fireHealing(Map<String, Object> healingEvent) {
        deliver("HEALING_EVENT", healingEvent);
    }

    public void fireAlert(Map<String, Object> alert) {
        deliver("ALERT_FIRED", alert);
    }

    public void fireExperiment(Map<String, Object> summary) {
        deliver("EXPERIMENT_COMPLETE", summary);
    }

    private void deliver(String eventType, Map<String, Object> payload) {
        if (registeredUrls.isEmpty()) return;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("eventType",  eventType);
        body.put("timestamp",  System.currentTimeMillis());
        body.put("source",     "cloudscale-enterprise");
        body.put("payload",    payload);

        String json;
        try {
            json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(body);
        } catch (Exception e) {
            log.warn("Webhook serialization failed: {}", e.getMessage());
            return;
        }

        for (String url : registeredUrls) {
            final String finalJson = json;
            pool.submit(() -> {
                try {
                    HttpRequest req = HttpRequest.newBuilder()
                            .uri(URI.create(url))
                            .timeout(Duration.ofSeconds(8))
                            .header("Content-Type", "application/json")
                            .header("X-CloudScale-Event", eventType)
                            .POST(HttpRequest.BodyPublishers.ofString(finalJson))
                            .build();

                    HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
                    log.info("Webhook {} delivered to {} → HTTP {}", eventType, url, resp.statusCode());
                } catch (Exception e) {
                    log.warn("Webhook delivery failed to {}: {}", url, e.getMessage());
                }
            });
        }
    }
}

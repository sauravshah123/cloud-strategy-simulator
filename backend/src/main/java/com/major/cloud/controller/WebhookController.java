package com.major.cloud.controller;

import com.major.cloud.service.WebhookService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/webhooks")
@RequiredArgsConstructor
@Tag(name = "Webhooks", description = "Register URLs to receive event notifications")
public class WebhookController {

    private final WebhookService webhookService;

    @PostMapping
    @Operation(summary = "Register a webhook URL")
    public ResponseEntity<Map<String, String>> register(@RequestBody Map<String, String> body) {
        String url = body.get("url");
        if (url == null || url.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "url is required"));
        }
        String registered = webhookService.register(url);
        return ResponseEntity.ok(Map.of("registered", registered));
    }

    @DeleteMapping
    @Operation(summary = "Unregister a webhook URL")
    public ResponseEntity<Map<String, Object>> unregister(@RequestParam String url) {
        boolean removed = webhookService.unregister(url);
        return ResponseEntity.ok(Map.of("removed", removed, "url", url));
    }

    @GetMapping
    @Operation(summary = "List registered webhook URLs")
    public ResponseEntity<List<String>> list() {
        return ResponseEntity.ok(webhookService.getRegistered());
    }
}

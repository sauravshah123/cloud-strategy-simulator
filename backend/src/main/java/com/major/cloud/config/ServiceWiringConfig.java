package com.major.cloud.config;

import com.major.cloud.service.AlertService;
import com.major.cloud.service.WebhookService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;

/**
 * Resolves circular dependency by wiring WebhookService into AlertService
 * after the full application context has been built.
 */
@Configuration
@RequiredArgsConstructor
public class ServiceWiringConfig {

    private final AlertService  alertService;
    private final WebhookService webhookService;

    @EventListener(ContextRefreshedEvent.class)
    public void wireServices() {
        alertService.setWebhookService(webhookService);
    }
}

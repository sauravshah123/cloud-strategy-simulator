package com.major.cloud.service;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.command.CreateContainerResponse;
import com.github.dockerjava.api.model.Container;
import com.github.dockerjava.core.DefaultDockerClientConfig;
import com.github.dockerjava.core.DockerClientImpl;
import com.github.dockerjava.httpclient5.ApacheDockerHttpClient;
import com.github.dockerjava.transport.DockerHttpClient;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class DockerOrchestrationService {

    private DockerClient dockerClient;
    private boolean dockerAvailable = false;

    // Track active containers by strategy name
    private final Map<String, List<String>> activeContainers = new ConcurrentHashMap<>();

    public DockerOrchestrationService() {
        try {
            DefaultDockerClientConfig config = DefaultDockerClientConfig
                    .createDefaultConfigBuilder().build();
            DockerHttpClient httpClient = new ApacheDockerHttpClient.Builder()
                    .dockerHost(config.getDockerHost())
                    .sslConfig(config.getSSLConfig())
                    .maxConnections(50)
                    .connectionTimeout(Duration.ofSeconds(10))
                    .responseTimeout(Duration.ofSeconds(30))
                    .build();
            dockerClient = DockerClientImpl.getInstance(config, httpClient);
            // Ping to confirm daemon is reachable
            dockerClient.pingCmd().exec();
            dockerAvailable = true;
            log.info("✅ Docker daemon connected successfully.");
        } catch (Exception e) {
            dockerAvailable = false;
            log.warn("⚠️ Docker daemon is not available. Docker-based experiments will be skipped. Reason: {}", e.getMessage());
        }
    }

    public boolean isDockerAvailable() {
        return dockerAvailable;
    }

    public void pullImage(String image) {
        if (!dockerAvailable) { log.warn("Docker not available, skipping pull: {}", image); return; }
        try {
            log.info("Pulling image: {}", image);
            dockerClient.pullImageCmd(image).start().awaitCompletion();
            log.info("Image pulled: {}", image);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Image pull interrupted for {}", image, e);
        } catch (Exception e) {
            log.error("Failed to pull image {}: {}", image, e.getMessage());
        }
    }

    public String startContainer(String strategyName, String image) {
        if (!dockerAvailable) return null;
        try {
            CreateContainerResponse container = dockerClient.createContainerCmd(image)
                    .withLabels(Map.of(
                        "cloud-strategy-simulator", "true",
                        "strategy", strategyName
                    ))
                    .exec();
            dockerClient.startContainerCmd(container.getId()).exec();
            activeContainers.computeIfAbsent(strategyName, k -> new ArrayList<>())
                            .add(container.getId());
            log.info("Started container {} for strategy {}", container.getId().substring(0, 8), strategyName);
            return container.getId();
        } catch (Exception e) {
            log.error("Failed to start container for strategy {}: {}", strategyName, e.getMessage());
            return null;
        }
    }

    public void stopContainer(String strategyName) {
        if (!dockerAvailable) return;
        List<String> containers = activeContainers.get(strategyName);
        if (containers != null && !containers.isEmpty()) {
            String containerId = containers.remove(containers.size() - 1);
            forceStop(containerId);
        }
    }

    public void stopSpecificContainer(String strategyName, String containerId) {
        if (!dockerAvailable) return;
        List<String> containers = activeContainers.get(strategyName);
        if (containers != null && containers.remove(containerId)) {
            forceStop(containerId);
        }
    }

    private void forceStop(String containerId) {
        try {
            dockerClient.stopContainerCmd(containerId).withTimeout(5).exec();
            dockerClient.removeContainerCmd(containerId).withForce(true).exec();
            log.info("Stopped container {}", containerId.substring(0, 8));
        } catch (Exception e) {
            log.error("Failed to stop container {}: {}", containerId.substring(0, 8), e.getMessage());
        }
    }

    public List<String> getActiveContainers(String strategyName) {
        return new ArrayList<>(activeContainers.getOrDefault(strategyName, new ArrayList<>()));
    }

    public boolean isRunning(String containerId) {
        if (!dockerAvailable) return false;
        try {
            Boolean running = dockerClient.inspectContainerCmd(containerId).exec().getState().getRunning();
            return Boolean.TRUE.equals(running);
        } catch (Exception e) {
            return false; // Container gone or inspect failed
        }
    }

    public void cleanupAll() {
        activeContainers.forEach((strategy, containers) ->
            new ArrayList<>(containers).forEach(this::forceStop));
        activeContainers.clear();
        log.info("Cleaned up all managed containers.");
    }

    @PreDestroy
    public void onDestroy() {
        cleanupAll();
        if (dockerClient != null) {
            try { dockerClient.close(); } catch (IOException e) { log.error("Error closing docker client", e); }
        }
    }
}

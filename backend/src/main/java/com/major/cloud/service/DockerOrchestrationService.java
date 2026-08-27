package com.major.cloud.service;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.command.CreateContainerResponse;
import com.github.dockerjava.api.model.Container;
import com.github.dockerjava.api.model.RestartPolicy;
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

    /**
     * Pulls the given image. Returns {@code true} on success, {@code false} on failure.
     * Callers should abort the experiment if this returns false.
     */
    public boolean pullImage(String image) {
        if (!dockerAvailable) {
            log.warn("Docker not available, skipping pull: {}", image);
            return false;
        }
        try {
            log.info("Pulling image: {}", image);
            dockerClient.pullImageCmd(image).start().awaitCompletion();
            log.info("Image pulled: {}", image);
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Image pull interrupted for {}", image, e);
            return false;
        } catch (Exception e) {
            log.error("Failed to pull image {}: {}", image, e.getMessage());
            return false;
        }
    }

    /**
     * Starts a container for any image — short-lived images (alpine, busybox, etc.)
     * are given a long-running sleep entrypoint so they stay alive for the duration
     * of the experiment. A restart-on-failure policy ensures the container recovers
     * after a chaos crash, enabling self-healing to kick in.
     */
    public String startContainer(String strategyName, String image) {
        if (!dockerAvailable) return null;
        String normImage = normaliseImage(image);
        try {
            CreateContainerResponse container = dockerClient.createContainerCmd(normImage)
                    // Keep any image alive for up to 1 h — works for busybox, alpine, nginx, redis, etc.
                    .withEntrypoint("sh", "-c", "sleep 3600")
                    // Restart up to 5 times on non-zero exit so chaos self-healing has something to observe
                    .withRestartPolicy(RestartPolicy.onFailureRestart(5))
                    .withLabels(Map.of(
                        "cloud-strategy-simulator", "true",
                        "strategy", strategyName
                    ))
                    .exec();
            dockerClient.startContainerCmd(container.getId()).exec();
            activeContainers.computeIfAbsent(strategyName, k -> new ArrayList<>())
                            .add(container.getId());
            log.info("Started container {} ({}) for strategy {}", shortId(container.getId()), normImage, strategyName);
            return container.getId();
        } catch (Exception e) {
            // Fallback: try without the sleep entrypoint override for images that have their own daemon
            log.warn("sleep-entrypoint failed for {} — retrying with default entrypoint: {}", normImage, e.getMessage());
            try {
                CreateContainerResponse container = dockerClient.createContainerCmd(normImage)
                        .withRestartPolicy(RestartPolicy.onFailureRestart(5))
                        .withLabels(Map.of(
                            "cloud-strategy-simulator", "true",
                            "strategy", strategyName
                        ))
                        .exec();
                dockerClient.startContainerCmd(container.getId()).exec();
                activeContainers.computeIfAbsent(strategyName, k -> new ArrayList<>())
                                .add(container.getId());
                log.info("Started container {} ({}) [default entrypoint] for strategy {}",
                         shortId(container.getId()), normImage, strategyName);
                return container.getId();
            } catch (Exception ex) {
                log.error("Failed to start container for strategy {} image {}: {}", strategyName, normImage, ex.getMessage());
                return null;
            }
        }
    }

    /**
     * Appends {@code :latest} to bare image names that have no tag or digest.
     * docker-java throws a parse error on bare names like {@code nginx} or {@code redis}.
     */
    private static String normaliseImage(String image) {
        if (image == null || image.isBlank()) return image;
        String trimmed = image.trim();
        // Already has a tag (contains ':') or is a digest reference (contains '@')
        if (trimmed.contains(":") || trimmed.contains("@")) return trimmed;
        return trimmed + ":latest";
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

    /**
     * Returns a safe short ID (max 12 chars) without throwing if the ID is unexpectedly short.
     */
    private String shortId(String id) {
        if (id == null) return "<null>";
        return id.length() > 12 ? id.substring(0, 12) : id;
    }

    private void forceStop(String containerId) {
        try {
            dockerClient.stopContainerCmd(containerId).withTimeout(5).exec();
            dockerClient.removeContainerCmd(containerId).withForce(true).exec();
            log.info("Stopped container {}", shortId(containerId));
        } catch (Exception e) {
            log.error("Failed to stop container {}: {}", shortId(containerId), e.getMessage());
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

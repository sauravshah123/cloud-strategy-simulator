package com.major.cloud.service;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.command.CreateContainerResponse;
import com.github.dockerjava.api.model.Container;
import com.github.dockerjava.api.model.Statistics;
import com.github.dockerjava.core.DefaultDockerClientConfig;
import com.github.dockerjava.core.DockerClientImpl;
import com.github.dockerjava.httpclient5.ApacheDockerHttpClient;
import com.github.dockerjava.transport.DockerHttpClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.PreDestroy;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class DockerOrchestrationService {

    private final DockerClient dockerClient;
    
    // Track active containers by strategy
    private final Map<String, List<String>> activeContainers = new ConcurrentHashMap<>();

    public DockerOrchestrationService() {
        DefaultDockerClientConfig config = DefaultDockerClientConfig.createDefaultConfigBuilder().build();
        DockerHttpClient httpClient = new ApacheDockerHttpClient.Builder()
                .dockerHost(config.getDockerHost())
                .sslConfig(config.getSSLConfig())
                .maxConnections(100)
                .connectionTimeout(Duration.ofSeconds(30))
                .responseTimeout(Duration.ofSeconds(45))
                .build();
        this.dockerClient = DockerClientImpl.getInstance(config, httpClient);
    }

    public void pullImage(String image) {
        try {
            log.info("Pulling image: {}", image);
            dockerClient.pullImageCmd(image).start().awaitCompletion();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Image pull interrupted", e);
        }
    }

    public String startContainer(String strategyName, String image) {
        try {
            CreateContainerResponse container = dockerClient.createContainerCmd(image)
                    .withLabels(Map.of("cloud-strategy-simulator", "true", "strategy", strategyName))
                    .exec();
            
            dockerClient.startContainerCmd(container.getId()).exec();
            
            activeContainers.computeIfAbsent(strategyName, k -> new ArrayList<>()).add(container.getId());
            log.info("Started container {} for strategy {}", container.getId(), strategyName);
            return container.getId();
        } catch (Exception e) {
            log.error("Failed to start container for strategy {}", strategyName, e);
            return null;
        }
    }

    public void stopContainer(String strategyName) {
        List<String> containers = activeContainers.get(strategyName);
        if (containers != null && !containers.isEmpty()) {
            String containerId = containers.remove(containers.size() - 1);
            try {
                dockerClient.stopContainerCmd(containerId).withTimeout(5).exec();
                dockerClient.removeContainerCmd(containerId).withForce(true).exec();
                log.info("Stopped and removed container {} for strategy {}", containerId, strategyName);
            } catch (Exception e) {
                log.error("Failed to stop container {}", containerId, e);
            }
        }
    }

    public void stopSpecificContainer(String strategyName, String containerId) {
        List<String> containers = activeContainers.get(strategyName);
        if (containers != null && containers.remove(containerId)) {
            try {
                dockerClient.stopContainerCmd(containerId).withTimeout(5).exec();
                dockerClient.removeContainerCmd(containerId).withForce(true).exec();
                log.info("Stopped and removed specific container {} for strategy {}", containerId, strategyName);
            } catch (Exception e) {
                log.error("Failed to stop specific container {}", containerId, e);
            }
        }
    }

    public List<String> getActiveContainers(String strategyName) {
        return activeContainers.getOrDefault(strategyName, new ArrayList<>());
    }

    public void cleanupAll() {
        activeContainers.values().forEach(list -> list.forEach(id -> {
            try {
                dockerClient.stopContainerCmd(id).withTimeout(5).exec();
                dockerClient.removeContainerCmd(id).withForce(true).exec();
            } catch (Exception ignored) { }
        }));
        activeContainers.clear();
        log.info("Cleaned up all managed containers.");
    }

    public boolean isRunning(String containerId) {
        try {
            return dockerClient.inspectContainerCmd(containerId).exec().getState().getRunning();
        } catch (Exception e) {
            return false;
        }
    }

    // Optional: get actual stats if needed
    public double getAverageCpuForStrategy(String strategyName) {
        List<String> containers = getActiveContainers(strategyName);
        if (containers.isEmpty()) return 0.0;
        
        // This is a complex operation with docker-java because it streams stats.
        // For simulation purposes, we might just return the host stats for simplicity,
        // or actually implement a block to fetch one stat snapshot.
        return 0.0; 
    }

    @PreDestroy
    public void onDestroy() {
        cleanupAll();
        try {
            dockerClient.close();
        } catch (IOException e) {
            log.error("Failed to close docker client", e);
        }
    }
}

package com.major.cloud.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

@Service
public class MonitoringService {
    private final Random random = new Random();

    public static class Workload {
        public double trafficBase;
        public double trend;
    }

    public List<Workload> generateTrafficWave(int steps) {
        List<Workload> wave = new ArrayList<>();
        double currentTraffic = 100 + random.nextDouble() * 200; // start 100-300

        for (int i = 0; i < steps; i++) {
            Workload w = new Workload();
            w.trafficBase = currentTraffic;
            
            // Randomly grow or shrink traffic
            double trend = 0.7 + random.nextDouble() * 0.8; // 0.7 to 1.5
            w.trend = trend;
            
            wave.add(w);
            currentTraffic = currentTraffic * trend;
        }
        return wave;
    }

    public double calculateCpu(double trafficBase, int replicas) {
        double cpu = (trafficBase / replicas) * 0.8;
        return Math.min(100.0, cpu);
    }

    public double calculateLatency(double trafficBase, int replicas) {
        return (trafficBase / replicas) * 2.5; 
    }
}

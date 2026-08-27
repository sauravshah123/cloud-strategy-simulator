package com.major.cloud.model.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/**
 * Persistent record of every experiment run.
 * The full JSON result payload is stored as a CLOB so we
 * preserve the rich per-strategy timeline without a complex schema.
 */
@Entity
@Table(name = "experiment_runs")
@Data
@NoArgsConstructor
public class ExperimentRunEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "run_at", nullable = false)
    private Instant runAt;

    @Column(name = "best_strategy", length = 50)
    private String bestStrategy;

    @Column(name = "peak_cpu_usage")
    private Double peakCpuUsage;

    @Column(name = "peak_mem_usage")
    private Double peakMemUsage;

    @Column(name = "avg_cpu_usage")
    private Double avgCpuUsage;

    @Column(name = "sample_count")
    private Integer sampleCount;

    @Column(name = "docker_image", length = 256)
    private String dockerImage;

    /** Full JSON payload of the experiment result (strategies, timelines, costs, SLA). */
    @Lob
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "result_json", columnDefinition = "TEXT")
    private String resultJson;
}

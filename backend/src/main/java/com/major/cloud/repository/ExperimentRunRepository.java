package com.major.cloud.repository;

import com.major.cloud.model.entity.ExperimentRunEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ExperimentRunRepository extends JpaRepository<ExperimentRunEntity, Long> {
    /** Most recent N runs, newest first. */
    List<ExperimentRunEntity> findTop10ByOrderByRunAtDesc();

    /** Runs for a specific strategy winner. */
    List<ExperimentRunEntity> findByBestStrategyOrderByRunAtDesc(String bestStrategy);
}

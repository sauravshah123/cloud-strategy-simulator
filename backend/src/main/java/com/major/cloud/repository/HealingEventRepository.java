package com.major.cloud.repository;

import com.major.cloud.model.entity.HealingEventEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface HealingEventRepository extends JpaRepository<HealingEventEntity, Long> {

    List<HealingEventEntity> findByStrategyOrderByOccurredAtDesc(String strategy);

    Page<HealingEventEntity> findAllByOrderByOccurredAtDesc(Pageable pageable);

    List<HealingEventEntity> findByOccurredAtAfterOrderByOccurredAtDesc(Instant since);

    @Query("SELECT COUNT(h) FROM HealingEventEntity h WHERE h.mode = :mode")
    long countByMode(String mode);
}

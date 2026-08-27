package com.major.cloud.repository;

import com.major.cloud.model.entity.AuditLogEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLogEntry, Long> {

    Page<AuditLogEntry> findAllByOrderByCreatedAtDesc(Pageable pageable);

    List<AuditLogEntry> findByActionTypeOrderByCreatedAtDesc(String actionType);

    List<AuditLogEntry> findByCreatedAtAfterOrderByCreatedAtDesc(Instant since);

    long countByActionType(String actionType);
}

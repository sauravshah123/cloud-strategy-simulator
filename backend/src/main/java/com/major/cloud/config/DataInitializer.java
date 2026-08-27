package com.major.cloud.config;

import com.major.cloud.model.entity.AppUser;
import com.major.cloud.repository.AppUserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Set;

/**
 * Seeds the database with a default admin user on first startup.
 * Change the password immediately in production!
 *
 * Default credentials: admin / admin123
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final AppUserRepository userRepository;
    private final PasswordEncoder   passwordEncoder;

    @Override
    public void run(String... args) {
        if (!userRepository.existsByUsername("admin")) {
            AppUser admin = new AppUser();
            admin.setUsername("admin");
            admin.setEmail("admin@cloudscale.local");
            admin.setPasswordHash(passwordEncoder.encode("admin123"));
            admin.setRoles(Set.of("ROLE_ADMIN", "ROLE_OPERATOR", "ROLE_VIEWER"));
            admin.setEnabled(true);
            admin.setCreatedAt(Instant.now());
            userRepository.save(admin);
            log.warn("⚠️  Default admin user created (username=admin, password=admin123). " +
                     "Change the password immediately!");
        }

        if (!userRepository.existsByUsername("viewer")) {
            AppUser viewer = new AppUser();
            viewer.setUsername("viewer");
            viewer.setEmail("viewer@cloudscale.local");
            viewer.setPasswordHash(passwordEncoder.encode("viewer123"));
            viewer.setRoles(Set.of("ROLE_VIEWER"));
            viewer.setEnabled(true);
            viewer.setCreatedAt(Instant.now());
            userRepository.save(viewer);
            log.info("Default viewer user created (username=viewer, password=viewer123).");
        }
    }
}

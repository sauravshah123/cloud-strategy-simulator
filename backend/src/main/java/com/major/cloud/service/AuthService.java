package com.major.cloud.service;

import com.major.cloud.model.entity.AppUser;
import com.major.cloud.repository.AppUserRepository;
import com.major.cloud.security.JwtUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.Set;

/**
 * Handles user registration, login, and token refresh.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final AppUserRepository  userRepository;
    private final AuthenticationManager authManager;
    private final JwtUtils           jwtUtils;
    private final PasswordEncoder    passwordEncoder;
    private final AuditLogService    auditLogService;

    @Transactional
    public Map<String, Object> register(String username, String email, String password) {
        if (userRepository.existsByUsername(username)) {
            throw new IllegalArgumentException("Username already taken: " + username);
        }
        if (email != null && userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("Email already registered: " + email);
        }

        AppUser user = new AppUser();
        user.setUsername(username);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(password));
        // First registered user gets ADMIN; all others get VIEWER
        user.setRoles(userRepository.count() == 0
                ? Set.of("ROLE_ADMIN", "ROLE_OPERATOR", "ROLE_VIEWER")
                : Set.of("ROLE_VIEWER"));
        user.setEnabled(true);
        userRepository.save(user);

        auditLogService.system(AuditLogService.ActionType.USER_ACTION,
                "AUTH", "User registered: " + username);

        log.info("User registered: {}", username);
        return Map.of("message", "User registered successfully", "username", username);
    }

    @Transactional
    public Map<String, String> login(String username, String password) {
        Authentication auth = authManager.authenticate(
                new UsernamePasswordAuthenticationToken(username, password));

        UserDetails userDetails = (UserDetails) auth.getPrincipal();

        // Update last login
        userRepository.findByUsername(username).ifPresent(u -> {
            u.setLastLoginAt(Instant.now());
            userRepository.save(u);
        });

        String accessToken  = jwtUtils.generateAccessToken(userDetails);
        String refreshToken = jwtUtils.generateRefreshToken(username);

        auditLogService.user(AuditLogService.ActionType.USER_ACTION,
                "AUTH", "User logged in: " + username);

        return Map.of(
            "accessToken",  accessToken,
            "refreshToken", refreshToken,
            "tokenType",    "Bearer",
            "username",     username
        );
    }

    public Map<String, String> refresh(String refreshToken) {
        if (!jwtUtils.validateToken(refreshToken)) {
            throw new IllegalArgumentException("Invalid or expired refresh token");
        }
        String username = jwtUtils.extractUsername(refreshToken);
        AppUser user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + username));

        if (!user.isEnabled()) {
            throw new IllegalArgumentException("User account is disabled");
        }

        // Load UserDetails to include roles in the new access token
        org.springframework.security.core.userdetails.User userDetails =
                new org.springframework.security.core.userdetails.User(
                    user.getUsername(), user.getPasswordHash(),
                    user.getRoles().stream()
                        .map(org.springframework.security.core.authority.SimpleGrantedAuthority::new)
                        .toList()
                );

        return Map.of(
            "accessToken", jwtUtils.generateAccessToken(userDetails),
            "tokenType",   "Bearer"
        );
    }
}

package com.major.cloud.controller;

import com.major.cloud.service.StrategyConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/config")
@RequiredArgsConstructor
@Tag(name = "Strategy Config", description = "Tune scaling thresholds for each strategy at runtime")
public class StrategyConfigController {

    private final StrategyConfigService configService;

    @GetMapping
    @Operation(summary = "Get all strategy configs")
    public ResponseEntity<?> getAll() {
        return ResponseEntity.ok(configService.getAll());
    }

    @GetMapping("/{strategy}")
    @Operation(summary = "Get config for one strategy")
    public ResponseEntity<?> get(@PathVariable String strategy) {
        var config = configService.get(strategy);
        return config != null ? ResponseEntity.ok(config)
                              : ResponseEntity.notFound().build();
    }

    @PutMapping("/{strategy}")
    @Operation(summary = "Update strategy config")
    public ResponseEntity<?> update(@PathVariable String strategy,
                                    @RequestBody StrategyConfigService.StrategyConfig config) {
        return ResponseEntity.ok(configService.update(strategy, config));
    }

    @PostMapping("/{strategy}/reset")
    @Operation(summary = "Reset strategy config to defaults")
    public ResponseEntity<?> reset(@PathVariable String strategy) {
        return ResponseEntity.ok(configService.reset(strategy));
    }
}

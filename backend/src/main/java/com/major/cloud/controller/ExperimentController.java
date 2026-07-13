package com.major.cloud.controller;

import com.major.cloud.model.ExperimentResult;
import com.major.cloud.service.ExperimentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/experiment")
@RequiredArgsConstructor
public class ExperimentController {

    private final ExperimentService experimentService;

    @PostMapping
    public ResponseEntity<ExperimentResult> runExperiment(@RequestBody List<String> strategies) {
        ExperimentResult result = experimentService.runExperiment(strategies);
        return ResponseEntity.ok(result);
    }
}

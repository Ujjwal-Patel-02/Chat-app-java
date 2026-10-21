package com.aurora.chat.common;

import java.time.Instant;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Liveness endpoints. {@code /api/health} is also what the frontend pings to wake a sleeping free instance. */
@RestController
public class HealthController {

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of("status", "UP", "time", Instant.now().toString());
    }

    @GetMapping("/")
    public Map<String, Object> root() {
        return Map.of(
                "name", "Aurora Chat API",
                "status", "UP",
                "health", "/api/health",
                "websocket", "/ws");
    }
}

package com.aurora.chat.config;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;

/**
 * Automatic keep-alive: every 10 minutes the server calls its own public {@code /api/health} URL.
 * Free hosts such as Render put a service to sleep after 15 minutes without incoming traffic; the request goes out
 * to the public URL and back in through the host's proxy, so it counts as traffic and the app stays awake.
 * The health endpoint never touches the database, so a scale-to-zero database (Neon) can still sleep.
 */
@Component
public class KeepAliveService {

    private static final Logger log = LoggerFactory.getLogger(KeepAliveService.class);

    private final AppProperties.KeepAlive config;
    private final HttpClient http;
    private final TaskScheduler scheduler;
    private final URI target;
    private final AtomicInteger failuresInARow = new AtomicInteger();
    private volatile Instant lastSuccess;
    private ScheduledFuture<?> task;

    public KeepAliveService(AppProperties properties, HttpClient outboundHttpClient,
                            @Qualifier("taskScheduler") TaskScheduler scheduler) {
        this.config = properties.keepAlive();
        this.http = outboundHttpClient;
        this.scheduler = scheduler;
        this.target = resolveTarget(config.url());
    }

    /** {@code https://host} or {@code https://host/} → {@code https://host/api/health}; full health URLs are kept. */
    static URI resolveTarget(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        String base = url.trim().replaceAll("/+$", "");
        if (!base.startsWith("http://") && !base.startsWith("https://")) {
            base = "https://" + base;
        }
        return URI.create(base.endsWith("/api/health") ? base : base + "/api/health");
    }

    public boolean isActive() {
        return task != null;
    }

    public URI target() {
        return target;
    }

    public Instant lastSuccess() {
        return lastSuccess;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        if (!config.enabled()) {
            log.info("Keep-alive is turned off (APP_KEEP_ALIVE_ENABLED=false).");
            return;
        }
        if (target == null) {
            log.info("Keep-alive is idle: no public URL known. On Render it is detected automatically; elsewhere set APP_KEEP_ALIVE_URL.");
            return;
        }
        Duration interval = config.interval().compareTo(Duration.ofSeconds(1)) < 0 ? Duration.ofMinutes(10) : config.interval();
        task = scheduler.scheduleAtFixedRate(this::ping, Instant.now().plus(config.initialDelay()), interval);
        log.info("Keep-alive: pinging {} every {} so the server doesn't go to sleep.", target, human(interval));
    }

    void ping() {
        HttpRequest request = HttpRequest.newBuilder(target)
                .timeout(Duration.ofSeconds(30))
                .header("User-Agent", "AuroraChat-KeepAlive/1.0")
                .GET()
                .build();
        try {
            HttpResponse<Void> response = http.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() / 100 == 2) {
                lastSuccess = Instant.now();
                if (failuresInARow.getAndSet(0) > 0) {
                    log.info("Keep-alive is working again ({}).", target);
                } else {
                    log.debug("Keep-alive ping OK");
                }
            } else {
                failed("HTTP " + response.statusCode());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            failed(e.getClass().getSimpleName() + (e.getMessage() == null ? "" : ": " + e.getMessage()));
        }
    }

    private void failed(String reason) {
        int failures = failuresInARow.incrementAndGet();
        // Log the first failure and then every 6th (about once an hour) to avoid noisy logs.
        if (failures == 1 || failures % 6 == 0) {
            log.warn("Keep-alive ping to {} failed ({}), attempt {}. Check APP_KEEP_ALIVE_URL.", target, reason, failures);
        }
    }

    @PreDestroy
    void stop() {
        if (task != null) {
            task.cancel(false);
        }
    }

    private static String human(Duration duration) {
        long seconds = duration.toSeconds();
        return seconds % 60 == 0 ? (seconds / 60) + " min" : seconds + " s";
    }
}

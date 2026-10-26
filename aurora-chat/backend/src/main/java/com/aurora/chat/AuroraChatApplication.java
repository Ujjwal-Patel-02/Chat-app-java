package com.aurora.chat;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Aurora Chat API: REST endpoints for accounts, conversations and messages, plus
 * STOMP-over-WebSocket push events for real-time delivery, typing and presence.
 */
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
public class AuroraChatApplication {

    public static void main(String[] args) {
        SpringApplication.run(AuroraChatApplication.class, args);
    }
}

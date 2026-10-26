package com.aurora.chat.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * If a {@code DATABASE_URL} environment variable is present, translate it into
 * {@code spring.datasource.*} properties with the highest precedence. Without it, the app
 * falls back to the embedded H2 database configured in application.yml.
 */
public class DatabaseUrlEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String databaseUrl = environment.getProperty("DATABASE_URL");
        if (databaseUrl == null || databaseUrl.isBlank()) {
            return;
        }
        environment.getPropertySources().addFirst(
                new MapPropertySource("auroraDatabaseUrl", DatabaseUrlParser.toSpringProperties(databaseUrl)));
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}

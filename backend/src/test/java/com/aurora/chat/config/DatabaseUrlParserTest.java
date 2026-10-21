package com.aurora.chat.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import org.junit.jupiter.api.Test;

class DatabaseUrlParserTest {

    @Test
    void convertsNeonStyleUrl() {
        Map<String, Object> props = DatabaseUrlParser.toSpringProperties(
                "postgresql://neondb_owner:npg_Ab+C1@ep-cool-sky-123456.us-east-2.aws.neon.tech/neondb"
                        + "?sslmode=require&channel_binding=require");
        assertThat(props)
                .containsEntry("spring.datasource.url",
                        "jdbc:postgresql://ep-cool-sky-123456.us-east-2.aws.neon.tech:5432/neondb?sslmode=require")
                .containsEntry("spring.datasource.username", "neondb_owner")
                .containsEntry("spring.datasource.password", "npg_Ab+C1")
                .containsEntry("spring.datasource.driver-class-name", "org.postgresql.Driver");
    }

    @Test
    void defaultsSslForCloudHostsOnly() {
        assertThat(DatabaseUrlParser.toSpringProperties("postgres://u:p%40ss@db.example.com:6543/app"))
                .containsEntry("spring.datasource.url", "jdbc:postgresql://db.example.com:6543/app?sslmode=require")
                .containsEntry("spring.datasource.password", "p@ss");
        assertThat(DatabaseUrlParser.toSpringProperties("postgres://u:p@localhost/app"))
                .containsEntry("spring.datasource.url", "jdbc:postgresql://localhost:5432/app");
        assertThat(DatabaseUrlParser.toSpringProperties("postgres://u:p@dpg-abc123-a/app"))
                .containsEntry("spring.datasource.url", "jdbc:postgresql://dpg-abc123-a:5432/app");
    }

    @Test
    void passesJdbcUrlsThrough() {
        assertThat(DatabaseUrlParser.toSpringProperties("jdbc:postgresql://localhost:5432/chat"))
                .containsOnly(Map.entry("spring.datasource.url", "jdbc:postgresql://localhost:5432/chat"));
    }

    @Test
    void rejectsUnknownSchemes() {
        assertThatThrownBy(() -> DatabaseUrlParser.toSpringProperties("mysql://x@y/z"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}

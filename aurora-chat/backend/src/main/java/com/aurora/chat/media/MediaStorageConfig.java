package com.aurora.chat.media;

import java.net.http.HttpClient;
import java.nio.file.Path;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import com.aurora.chat.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;

@Configuration
public class MediaStorageConfig {

    private static final Logger log = LoggerFactory.getLogger(MediaStorageConfig.class);

    @Bean
    MediaStorage mediaStorage(AppProperties properties, HttpClient outboundHttpClient, ObjectMapper objectMapper,
                              Environment environment) {
        AppProperties.Media media = properties.media();
        String mode = media.storage() == null ? "auto" : media.storage().trim().toLowerCase(Locale.ROOT);
        boolean hasCloudinary = media.cloudinaryUrl() != null && !media.cloudinaryUrl().isBlank();

        MediaStorage storage;
        if (mode.equals("cloudinary") || (mode.equals("auto") && hasCloudinary)) {
            if (!hasCloudinary) {
                throw new IllegalStateException("APP_MEDIA_STORAGE=cloudinary requires CLOUDINARY_URL");
            }
            storage = new CloudinaryMediaStorage(CloudinaryCredentials.parse(media.cloudinaryUrl()),
                    media.cloudinaryFolder(), media.cloudinaryApiBase(), outboundHttpClient, objectMapper);
        } else {
            storage = new LocalMediaStorage(Path.of(media.localDir()));
            if (environment.getProperty("DATABASE_URL") != null) {
                log.warn("Media is stored on local disk. Hosts with ephemeral disks (e.g. Render free) delete these "
                        + "files on every restart: set CLOUDINARY_URL to keep photos and videos.");
            }
        }
        log.info("Media storage: {}", storage.name());
        return storage;
    }
}

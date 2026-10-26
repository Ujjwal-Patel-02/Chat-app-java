package com.aurora.chat.media;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

/** Stores files in a local directory; the API streams them (with HTTP range support for video seeking). */
public class LocalMediaStorage implements MediaStorage {

    private static final Logger log = LoggerFactory.getLogger(LocalMediaStorage.class);
    private static final Pattern SAFE_KEY = Pattern.compile("^[A-Za-z0-9-]+(\\.[a-z0-9]{2,5})?$");

    private final Path root;

    public LocalMediaStorage(Path root) {
        this.root = root.toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.root);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot create media directory " + this.root, e);
        }
    }

    @Override
    public StoredFile store(String key, Path file, String mimeType, boolean video) throws IOException {
        Path target = resolve(key);
        Files.move(file, target, StandardCopyOption.REPLACE_EXISTING);
        return new StoredFile(key, null);
    }

    @Override
    public void delete(String storageKey) {
        if (storageKey == null) {
            return;
        }
        try {
            Files.deleteIfExists(resolve(storageKey));
        } catch (IOException | IllegalArgumentException e) {
            log.warn("Could not delete media file {}: {}", storageKey, e.getMessage());
        }
    }

    @Override
    public Resource load(String storageKey) {
        Path path = resolve(storageKey);
        return Files.isRegularFile(path) ? new FileSystemResource(path) : null;
    }

    @Override
    public String name() {
        return "local disk (" + root + ")";
    }

    private Path resolve(String key) {
        if (key == null || !SAFE_KEY.matcher(key).matches()) {
            throw new IllegalArgumentException("Invalid media key");
        }
        Path path = root.resolve(key).normalize();
        if (!path.startsWith(root)) {
            throw new IllegalArgumentException("Invalid media key");
        }
        return path;
    }
}

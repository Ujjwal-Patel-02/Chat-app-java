package com.aurora.chat.media;

import java.io.IOException;
import java.nio.file.Path;

import org.springframework.core.io.Resource;

/** Where uploaded photos and videos live. */
public interface MediaStorage {

    /** Stores {@code file} (the implementation may move it) under a unique {@code key} such as "uuid.jpg". */
    StoredFile store(String key, Path file, String mimeType, boolean video) throws IOException;

    /** Best-effort delete. */
    void delete(String storageKey);

    /** The file for streaming, or null when the storage serves files from its own URLs. */
    Resource load(String storageKey);

    String name();
}

package com.aurora.chat.media;

/**
 * Result of storing a file. {@code publicUrl} is set when the storage serves files itself (e.g. a CDN);
 * when null, the API streams the file from {@code /api/media/...}.
 */
public record StoredFile(String storageKey, String publicUrl) {
}

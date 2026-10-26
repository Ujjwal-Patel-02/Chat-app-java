package com.aurora.chat.dto;

/** A photo or video. {@code url}/{@code thumbnailUrl} are absolute (CDN) or relative to the API base URL. */
public record AttachmentDto(String id, String kind, String url, String thumbnailUrl, String mimeType, long size,
                            Integer width, Integer height, Long durationMs, String placeholder, String name) {
}

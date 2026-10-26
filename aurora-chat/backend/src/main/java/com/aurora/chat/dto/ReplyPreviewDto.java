package com.aurora.chat.dto;

/**
 * Compact preview of the message being replied to (content is null when it was deleted or media-only).
 * {@code attachmentKind}/{@code thumbnailUrl} describe its first photo/video, if any.
 */
public record ReplyPreviewDto(Long id, UserSummaryDto sender, String content, boolean deleted, String attachmentKind,
                              int attachmentCount, String thumbnailUrl) {
}

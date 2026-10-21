package com.aurora.chat.dto;

/** Compact preview of the message being replied to (content is null when it was deleted). */
public record ReplyPreviewDto(Long id, UserSummaryDto sender, String content, boolean deleted) {
}
